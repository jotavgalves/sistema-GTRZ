import { randomUUID } from 'node:crypto';

import { appendAudit } from './audit';
import {
  recordCashMovement,
  requireOpenCashSession,
  type DatabaseCashMethod,
} from './cash';
import { getSessionState } from './control';
import type { DatabaseContext } from './types';
import { redeemVoucher, refundVoucher } from './vouchers';

export type DatabaseSaleItemKind = 'product' | 'combo';
export type DatabasePaymentMethod = DatabaseCashMethod | 'voucher';

export interface DatabaseOperationalCatalogItem {
  readonly id: string;
  readonly kind: DatabaseSaleItemKind;
  readonly name: string;
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  readonly salePriceCents: number;
  readonly availableUnits: number;
  readonly active: boolean;
}

export interface DatabaseSaleTable {
  readonly id: string;
  readonly eventId: string;
  readonly name: string;
  readonly kind: 'counter' | 'table';
  readonly status: 'open' | 'closed';
  readonly openedAt: number;
  readonly closedAt: number | null;
  readonly totalPaidCents: number;
  readonly saleCount: number;
}

export interface DatabaseSaleLine {
  readonly id: string;
  readonly itemKind: DatabaseSaleItemKind;
  readonly itemId: string;
  readonly itemName: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
  readonly totalPriceCents: number;
}

export interface DatabaseSalePayment {
  readonly id: string;
  readonly method: DatabasePaymentMethod;
  readonly amountCents: number;
  readonly voucherCode: string | null;
}

export interface DatabaseSale {
  readonly id: string;
  readonly eventId: string;
  readonly tableId: string;
  readonly tableName: string;
  readonly status: 'paid' | 'cancelled';
  readonly totalCents: number;
  readonly changeCents: number;
  readonly createdAt: number;
  readonly cancelledAt: number | null;
  readonly lines: readonly DatabaseSaleLine[];
  readonly payments: readonly DatabaseSalePayment[];
}

export interface DatabaseOperationState {
  readonly activeEventId: string | null;
  readonly tables: readonly DatabaseSaleTable[];
  readonly catalog: readonly DatabaseOperationalCatalogItem[];
  readonly recentSales: readonly DatabaseSale[];
}

interface TableRow {
  readonly id: string;
  readonly event_id: string;
  readonly name: string;
  readonly kind: 'counter' | 'table';
  readonly status: 'open' | 'closed';
  readonly opened_at: number;
  readonly closed_at: number | null;
  readonly total_paid_cents: number;
  readonly sale_count: number;
}

interface ProductCatalogRow {
  readonly id: string;
  readonly name: string;
  readonly category_id: string;
  readonly category_name: string;
  readonly sale_price_cents: number;
  readonly active: number;
  readonly available_quantity: number;
}

interface ComboCatalogRow {
  readonly id: string;
  readonly name: string;
  readonly sale_price_cents: number;
  readonly active: number;
}

interface ComboComponentRow {
  readonly combo_id: string;
  readonly product_id: string;
  readonly product_name: string;
  readonly required_quantity: number;
  readonly product_active: number;
  readonly available_quantity: number;
}

interface SaleRow {
  readonly id: string;
  readonly event_id: string;
  readonly table_id: string;
  readonly table_name: string;
  readonly status: 'paid' | 'cancelled';
  readonly total_cents: number;
  readonly change_cents: number;
  readonly created_at: number;
  readonly cancelled_at: number | null;
}

interface SaleLineRow {
  readonly id: string;
  readonly sale_id: string;
  readonly item_kind: DatabaseSaleItemKind;
  readonly item_id: string;
  readonly item_name: string;
  readonly quantity: number;
  readonly unit_price_cents: number;
  readonly total_price_cents: number;
}

interface SalePaymentRow {
  readonly id: string;
  readonly sale_id: string;
  readonly method: DatabasePaymentMethod;
  readonly amount_cents: number;
  readonly voucher_id: string | null;
  readonly voucher_code: string | null;
}

interface CheckoutLineInput {
  readonly itemKind: DatabaseSaleItemKind;
  readonly itemId: string;
  readonly quantity: number;
}

interface CheckoutPaymentInput {
  readonly method: DatabasePaymentMethod;
  readonly amountCents: number;
  readonly voucherCode?: string;
}

interface ConsumptionSnapshot {
  readonly productId: string;
  readonly productName: string;
  readonly quantity: number;
}

interface ResolvedLine {
  readonly id: string;
  readonly itemKind: DatabaseSaleItemKind;
  readonly itemId: string;
  readonly itemName: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
  readonly totalPriceCents: number;
}

function requireActiveEventId(database: DatabaseContext): string {
  const eventId = getSessionState(database).activeEvent?.id;

  if (eventId === undefined) {
    throw new Error('Selecione um evento aberto para iniciar uma venda.');
  }

  return eventId;
}

function requireProduction(database: DatabaseContext): void {
  if (getSessionState(database).profile !== 'production') {
    throw new Error('Esta operação exige o perfil Produção.');
  }
}

function ensureCounter(database: DatabaseContext, eventId: string): string {
  const existing = database.sqlite
    .prepare("SELECT id FROM sale_tables WHERE event_id = ? AND kind = 'counter'")
    .get(eventId) as { readonly id: string } | undefined;

  if (existing !== undefined) {
    return existing.id;
  }

  const counterId = randomUUID();
  const now = Date.now();
  database.sqlite.transaction(() => {
    database.sqlite
      .prepare(
        `INSERT INTO sale_tables
         (id, event_id, name, kind, status, opened_at, closed_at, created_at, updated_at)
         VALUES (?, ?, 'Balcão', 'counter', 'open', ?, NULL, ?, ?)`,
      )
      .run(counterId, eventId, now, now, now);
    appendAudit(database, {
      action: 'table.counter-created',
      entityType: 'sale-table',
      entityId: counterId,
      eventId,
      details: { name: 'Balcão' },
    });
  })();
  return counterId;
}

function mapTable(row: TableRow): DatabaseSaleTable {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    kind: row.kind,
    status: row.status,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    totalPaidCents: row.total_paid_cents,
    saleCount: row.sale_count,
  };
}

function listTables(database: DatabaseContext, eventId: string): readonly DatabaseSaleTable[] {
  const rows = database.sqlite
    .prepare(
      `SELECT
         st.id,
         st.event_id,
         st.name,
         st.kind,
         st.status,
         st.opened_at,
         st.closed_at,
         COALESCE(SUM(CASE WHEN s.status = 'paid' THEN s.total_cents ELSE 0 END), 0)
           AS total_paid_cents,
         COUNT(CASE WHEN s.status = 'paid' THEN 1 END) AS sale_count
       FROM sale_tables st
       LEFT JOIN sales s ON s.table_id = st.id
       WHERE st.event_id = ?
       GROUP BY st.id
       ORDER BY CASE st.kind WHEN 'counter' THEN 0 ELSE 1 END,
                st.status,
                st.name COLLATE NOCASE`,
    )
    .all(eventId) as TableRow[];
  return rows.map(mapTable);
}

function listProductCatalog(
  database: DatabaseContext,
  eventId: string,
): readonly DatabaseOperationalCatalogItem[] {
  const rows = database.sqlite
    .prepare(
      `SELECT
         p.id,
         p.name,
         p.category_id,
         pc.name AS category_name,
         p.sale_price_cents,
         p.active,
         COALESCE(es.quantity, 0) AS available_quantity
       FROM products p
       INNER JOIN product_categories pc ON pc.id = p.category_id
       LEFT JOIN event_stock es ON es.event_id = ? AND es.product_id = p.id
       ORDER BY pc.name COLLATE NOCASE, p.name COLLATE NOCASE`,
    )
    .all(eventId) as ProductCatalogRow[];
  return rows.map((row) => ({
    id: row.id,
    kind: 'product',
    name: row.name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    salePriceCents: row.sale_price_cents,
    availableUnits: row.available_quantity,
    active: row.active === 1,
  }));
}

function listComboCatalog(
  database: DatabaseContext,
  eventId: string,
): readonly DatabaseOperationalCatalogItem[] {
  const comboRows = database.sqlite
    .prepare('SELECT id, name, sale_price_cents, active FROM combos ORDER BY name COLLATE NOCASE')
    .all() as ComboCatalogRow[];
  const componentRows = database.sqlite
    .prepare(
      `SELECT
         cc.combo_id,
         p.id AS product_id,
         p.name AS product_name,
         cc.quantity AS required_quantity,
         p.active AS product_active,
         COALESCE(es.quantity, 0) AS available_quantity
       FROM combo_components cc
       INNER JOIN products p ON p.id = cc.product_id
       LEFT JOIN event_stock es ON es.event_id = ? AND es.product_id = p.id
       ORDER BY cc.combo_id`,
    )
    .all(eventId) as ComboComponentRow[];
  const componentsByCombo = new Map<string, ComboComponentRow[]>();

  for (const component of componentRows) {
    const grouped = componentsByCombo.get(component.combo_id) ?? [];
    grouped.push(component);
    componentsByCombo.set(component.combo_id, grouped);
  }

  return comboRows.map((combo) => {
    const components = componentsByCombo.get(combo.id) ?? [];
    const availableUnits =
      components.length === 0 || components.some((component) => component.product_active !== 1)
        ? 0
        : Math.min(
            ...components.map((component) =>
              Math.floor(component.available_quantity / component.required_quantity),
            ),
          );
    return {
      id: combo.id,
      kind: 'combo' as const,
      name: combo.name,
      categoryId: null,
      categoryName: 'Combos',
      salePriceCents: combo.sale_price_cents,
      availableUnits,
      active: combo.active === 1,
    };
  });
}

function mapSale(
  row: SaleRow,
  lineRows: readonly SaleLineRow[],
  paymentRows: readonly SalePaymentRow[],
): DatabaseSale {
  return {
    id: row.id,
    eventId: row.event_id,
    tableId: row.table_id,
    tableName: row.table_name,
    status: row.status,
    totalCents: row.total_cents,
    changeCents: row.change_cents,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
    lines: lineRows.map((line) => ({
      id: line.id,
      itemKind: line.item_kind,
      itemId: line.item_id,
      itemName: line.item_name,
      quantity: line.quantity,
      unitPriceCents: line.unit_price_cents,
      totalPriceCents: line.total_price_cents,
    })),
    payments: paymentRows.map((payment) => ({
      id: payment.id,
      method: payment.method,
      amountCents: payment.amount_cents,
      voucherCode: payment.voucher_code,
    })),
  };
}

function listSales(database: DatabaseContext, eventId: string): readonly DatabaseSale[] {
  const saleRows = database.sqlite
    .prepare(
      `SELECT id, event_id, table_id, table_name, status, total_cents,
              change_cents, created_at, cancelled_at
       FROM sales
       WHERE event_id = ?
       ORDER BY created_at DESC
       LIMIT 100`,
    )
    .all(eventId) as SaleRow[];
  const saleIds = saleRows.map((sale) => sale.id);

  if (saleIds.length === 0) {
    return [];
  }

  const placeholders = saleIds.map(() => '?').join(',');
  const lineRows = database.sqlite
    .prepare(
      `SELECT id, sale_id, item_kind, item_id, item_name, quantity,
              unit_price_cents, total_price_cents
       FROM sale_lines
       WHERE sale_id IN (${placeholders})
       ORDER BY rowid`,
    )
    .all(...saleIds) as SaleLineRow[];
  const paymentRows = database.sqlite
    .prepare(
      `SELECT id, sale_id, method, amount_cents, voucher_id, voucher_code
       FROM sale_payments
       WHERE sale_id IN (${placeholders})
       ORDER BY rowid`,
    )
    .all(...saleIds) as SalePaymentRow[];
  const linesBySale = new Map<string, SaleLineRow[]>();
  const paymentsBySale = new Map<string, SalePaymentRow[]>();

  for (const line of lineRows) {
    const grouped = linesBySale.get(line.sale_id) ?? [];
    grouped.push(line);
    linesBySale.set(line.sale_id, grouped);
  }

  for (const payment of paymentRows) {
    const grouped = paymentsBySale.get(payment.sale_id) ?? [];
    grouped.push(payment);
    paymentsBySale.set(payment.sale_id, grouped);
  }

  return saleRows.map((sale) =>
    mapSale(sale, linesBySale.get(sale.id) ?? [], paymentsBySale.get(sale.id) ?? []),
  );
}

function getSale(database: DatabaseContext, saleId: string): DatabaseSale {
  const eventId = getSessionState(database).activeEvent?.id;

  if (eventId === undefined) {
    throw new Error('Selecione um evento aberto.');
  }

  const sale = listSales(database, eventId).find((item) => item.id === saleId);

  if (sale === undefined) {
    throw new Error('A venda informada não existe no evento ativo.');
  }

  return sale;
}

export function getOperationState(database: DatabaseContext): DatabaseOperationState {
  const eventId = getSessionState(database).activeEvent?.id ?? null;

  if (eventId === null) {
    return { activeEventId: null, tables: [], catalog: [], recentSales: [] };
  }

  ensureCounter(database, eventId);
  return {
    activeEventId: eventId,
    tables: listTables(database, eventId),
    catalog: [...listProductCatalog(database, eventId), ...listComboCatalog(database, eventId)],
    recentSales: listSales(database, eventId),
  };
}

export function createSaleTable(database: DatabaseContext, nameInput: string): DatabaseSaleTable {
  requireProduction(database);
  const eventId = requireActiveEventId(database);
  ensureCounter(database, eventId);
  const name = nameInput.trim();
  const duplicate = database.sqlite
    .prepare('SELECT id FROM sale_tables WHERE event_id = ? AND name = ? COLLATE NOCASE')
    .get(eventId, name);

  if (duplicate !== undefined) {
    throw new Error('Já existe uma mesa com esse nome no evento.');
  }

  const tableId = randomUUID();
  const now = Date.now();
  database.sqlite.transaction(() => {
    database.sqlite
      .prepare(
        `INSERT INTO sale_tables
         (id, event_id, name, kind, status, opened_at, closed_at, created_at, updated_at)
         VALUES (?, ?, ?, 'table', 'open', ?, NULL, ?, ?)`,
      )
      .run(tableId, eventId, name, now, now, now);
    appendAudit(database, {
      action: 'table.created',
      entityType: 'sale-table',
      entityId: tableId,
      eventId,
      details: { name },
    });
  })();
  const table = listTables(database, eventId).find((item) => item.id === tableId);

  if (table === undefined) {
    throw new Error('A mesa criada não pôde ser carregada.');
  }

  return table;
}

export function changeSaleTableStatus(
  database: DatabaseContext,
  input: { readonly tableId: string; readonly status: 'open' | 'closed' },
): DatabaseSaleTable {
  const eventId = requireActiveEventId(database);
  const current = listTables(database, eventId).find((table) => table.id === input.tableId);

  if (current === undefined) {
    throw new Error('A mesa informada não pertence ao evento ativo.');
  }

  if (current.kind === 'counter' && input.status === 'closed') {
    throw new Error('O Balcão permanente não pode ser encerrado.');
  }

  if (current.status === input.status) {
    return current;
  }

  const now = Date.now();
  database.sqlite.transaction(() => {
    database.sqlite
      .prepare('UPDATE sale_tables SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?')
      .run(input.status, input.status === 'closed' ? now : null, now, current.id);
    appendAudit(database, {
      action: input.status === 'closed' ? 'table.closed' : 'table.reopened',
      entityType: 'sale-table',
      entityId: current.id,
      eventId,
      details: { name: current.name },
    });
  })();
  const updated = listTables(database, eventId).find((table) => table.id === current.id);

  if (updated === undefined) {
    throw new Error('A mesa atualizada não pôde ser carregada.');
  }

  return updated;
}

function resolveCheckout(
  database: DatabaseContext,
  eventId: string,
  lines: readonly CheckoutLineInput[],
): { readonly lines: readonly ResolvedLine[]; readonly consumptions: readonly ConsumptionSnapshot[] } {
  const resolvedLines: ResolvedLine[] = [];
  const consumptionMap = new Map<string, ConsumptionSnapshot>();

  function addConsumption(productId: string, productName: string, quantity: number): void {
    const current = consumptionMap.get(productId);
    consumptionMap.set(productId, {
      productId,
      productName,
      quantity: (current?.quantity ?? 0) + quantity,
    });
  }

  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new Error('As quantidades do carrinho devem ser inteiras e positivas.');
    }

    if (line.itemKind === 'product') {
      const product = database.sqlite
        .prepare('SELECT id, name, sale_price_cents, active FROM products WHERE id = ?')
        .get(line.itemId) as
        | {
            readonly id: string;
            readonly name: string;
            readonly sale_price_cents: number;
            readonly active: number;
          }
        | undefined;

      if (product === undefined || product.active !== 1) {
        throw new Error('Um dos produtos não existe ou está inativo.');
      }

      addConsumption(product.id, product.name, line.quantity);
      resolvedLines.push({
        id: randomUUID(),
        itemKind: 'product',
        itemId: product.id,
        itemName: product.name,
        quantity: line.quantity,
        unitPriceCents: product.sale_price_cents,
        totalPriceCents: product.sale_price_cents * line.quantity,
      });
      continue;
    }

    const combo = database.sqlite
      .prepare('SELECT id, name, sale_price_cents, active FROM combos WHERE id = ?')
      .get(line.itemId) as ComboCatalogRow | undefined;

    if (combo === undefined || combo.active !== 1) {
      throw new Error('Um dos combos não existe ou está inativo.');
    }

    const components = database.sqlite
      .prepare(
        `SELECT cc.combo_id, p.id AS product_id, p.name AS product_name,
                cc.quantity AS required_quantity, p.active AS product_active,
                COALESCE(es.quantity, 0) AS available_quantity
         FROM combo_components cc
         INNER JOIN products p ON p.id = cc.product_id
         LEFT JOIN event_stock es ON es.event_id = ? AND es.product_id = p.id
         WHERE cc.combo_id = ?`,
      )
      .all(eventId, combo.id) as ComboComponentRow[];

    if (components.length === 0 || components.some((component) => component.product_active !== 1)) {
      throw new Error('O combo possui composição inválida ou produto inativo.');
    }

    for (const component of components) {
      addConsumption(
        component.product_id,
        component.product_name,
        component.required_quantity * line.quantity,
      );
    }

    resolvedLines.push({
      id: randomUUID(),
      itemKind: 'combo',
      itemId: combo.id,
      itemName: combo.name,
      quantity: line.quantity,
      unitPriceCents: combo.sale_price_cents,
      totalPriceCents: combo.sale_price_cents * line.quantity,
    });
  }

  const consumptions = [...consumptionMap.values()];

  for (const consumption of consumptions) {
    const stock = database.sqlite
      .prepare('SELECT quantity FROM event_stock WHERE event_id = ? AND product_id = ?')
      .get(eventId, consumption.productId) as { readonly quantity: number } | undefined;
    const available = stock?.quantity ?? 0;

    if (available < consumption.quantity) {
      throw new Error(
        `Estoque insuficiente para ${consumption.productName}. Saldo atual: ${String(available)}.`,
      );
    }
  }

  return { lines: resolvedLines, consumptions };
}

export function checkoutSale(
  database: DatabaseContext,
  input: {
    readonly tableId: string;
    readonly lines: readonly CheckoutLineInput[];
    readonly payments: readonly CheckoutPaymentInput[];
    readonly cashReceivedCents?: number;
  },
): DatabaseSale {
  const eventId = requireActiveEventId(database);
  const session = requireOpenCashSession(database, eventId);
  ensureCounter(database, eventId);
  const table = listTables(database, eventId).find((item) => item.id === input.tableId);

  if (table === undefined || table.status !== 'open') {
    throw new Error('A mesa precisa estar aberta e pertencer ao evento ativo.');
  }

  if (input.lines.length === 0 || input.payments.length === 0 || input.payments.length > 2) {
    throw new Error('A venda exige itens e uma ou duas formas de pagamento.');
  }

  const lineKeys = input.lines.map((line) => `${line.itemKind}:${line.itemId}`);

  if (new Set(lineKeys).size !== lineKeys.length) {
    throw new Error('O mesmo item não pode aparecer duas vezes no carrinho.');
  }

  const voucherPayments = input.payments.filter((payment) => payment.method === 'voucher');

  if (voucherPayments.length > 1) {
    throw new Error('A venda aceita no máximo um voucher.');
  }

  const resolved = resolveCheckout(database, eventId, input.lines);
  const totalCents = resolved.lines.reduce((total, line) => total + line.totalPriceCents, 0);
  const paymentTotalCents = input.payments.reduce(
    (total, payment) => total + payment.amountCents,
    0,
  );

  if (paymentTotalCents !== totalCents) {
    throw new Error('A soma dos pagamentos precisa ser igual ao total da venda.');
  }

  const cashPaymentCents = input.payments.reduce(
    (total, payment) => total + (payment.method === 'cash' ? payment.amountCents : 0),
    0,
  );
  const cashReceivedCents = input.cashReceivedCents ?? cashPaymentCents;

  if (cashPaymentCents === 0 && input.cashReceivedCents !== undefined) {
    throw new Error('Valor recebido só pode ser informado quando houver pagamento em dinheiro.');
  }

  if (cashReceivedCents < cashPaymentCents) {
    throw new Error('O valor recebido em dinheiro é insuficiente.');
  }

  const changeCents = cashReceivedCents - cashPaymentCents;
  const saleId = randomUUID();
  const createdAt = Date.now();

  database.sqlite.transaction(() => {
    database.sqlite
      .prepare(
        `INSERT INTO sales
         (id, event_id, table_id, table_name, status, total_cents, change_cents,
          created_at, cancelled_at, cancellation_reason)
         VALUES (?, ?, ?, ?, 'paid', ?, ?, ?, NULL, NULL)`,
      )
      .run(saleId, eventId, table.id, table.name, totalCents, changeCents, createdAt);

    const insertLine = database.sqlite.prepare(
      `INSERT INTO sale_lines
       (id, sale_id, item_kind, item_id, item_name, quantity,
        unit_price_cents, total_price_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const line of resolved.lines) {
      insertLine.run(
        line.id,
        saleId,
        line.itemKind,
        line.itemId,
        line.itemName,
        line.quantity,
        line.unitPriceCents,
        line.totalPriceCents,
      );
    }

    for (const consumption of resolved.consumptions) {
      database.sqlite
        .prepare(
          `UPDATE event_stock
           SET quantity = quantity - ?, updated_at = ?
           WHERE event_id = ? AND product_id = ?`,
        )
        .run(consumption.quantity, createdAt, eventId, consumption.productId);
      database.sqlite
        .prepare(
          `INSERT INTO stock_movements
           (id, event_id, product_id, type, quantity, delta, note, created_at)
           VALUES (?, ?, ?, 'sale', ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          eventId,
          consumption.productId,
          consumption.quantity,
          -consumption.quantity,
          `Venda ${saleId}`,
          createdAt,
        );
    }

    const insertPayment = database.sqlite.prepare(
      `INSERT INTO sale_payments
       (id, sale_id, method, amount_cents, voucher_id, voucher_code)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );

    for (const payment of input.payments) {
      if (!Number.isInteger(payment.amountCents) || payment.amountCents <= 0) {
        throw new Error('Todos os pagamentos devem ter valor positivo.');
      }

      const paymentId = randomUUID();

      if (payment.method === 'voucher') {
        if (payment.voucherCode === undefined) {
          throw new Error('Informe o código do voucher.');
        }

        const voucher = redeemVoucher(database, {
          eventId,
          code: payment.voucherCode,
          amountCents: payment.amountCents,
          saleId,
          createdAt,
        });
        insertPayment.run(
          paymentId,
          saleId,
          payment.method,
          payment.amountCents,
          voucher.id,
          voucher.code,
        );
        continue;
      }

      insertPayment.run(paymentId, saleId, payment.method, payment.amountCents, null, null);
      recordCashMovement(database, {
        sessionId: session.id,
        eventId,
        type: 'sale',
        method: payment.method,
        amountCents: payment.amountCents,
        note: `Venda na ${table.name}`,
        sourceId: paymentId,
        createdAt,
      });
    }

    appendAudit(database, {
      action: 'sale.completed',
      entityType: 'sale',
      entityId: saleId,
      eventId,
      details: {
        changeCents,
        consumptions: resolved.consumptions,
        payments: input.payments.map((payment) => ({
          amountCents: payment.amountCents,
          method: payment.method,
        })),
        tableId: table.id,
        totalCents,
      },
    });
  })();

  return getSale(database, saleId);
}

function getConsumptionSnapshot(database: DatabaseContext, saleId: string): readonly ConsumptionSnapshot[] {
  const row = database.sqlite
    .prepare(
      `SELECT details_json
       FROM audit_log
       WHERE action = 'sale.completed' AND entity_id = ?
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get(saleId) as { readonly details_json: string } | undefined;

  if (row === undefined) {
    throw new Error('A composição original da venda não foi encontrada.');
  }

  const parsed: unknown = JSON.parse(row.details_json);

  if (typeof parsed !== 'object' || parsed === null || !('consumptions' in parsed)) {
    throw new Error('A composição original da venda está inválida.');
  }

  const consumptions = (parsed as { readonly consumptions: unknown }).consumptions;

  if (!Array.isArray(consumptions)) {
    throw new Error('A composição original da venda está inválida.');
  }

  return consumptions.map((item) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      !('productId' in item) ||
      !('productName' in item) ||
      !('quantity' in item) ||
      typeof item.productId !== 'string' ||
      typeof item.productName !== 'string' ||
      typeof item.quantity !== 'number'
    ) {
      throw new Error('A composição original da venda está inválida.');
    }

    return {
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
    };
  });
}

export function cancelSale(
  database: DatabaseContext,
  input: { readonly saleId: string; readonly reason: string },
): DatabaseSale {
  requireProduction(database);
  const eventId = requireActiveEventId(database);
  const session = requireOpenCashSession(database, eventId);
  const sale = getSale(database, input.saleId);

  if (sale.status === 'cancelled') {
    throw new Error('A venda já foi cancelada.');
  }

  const consumptions = getConsumptionSnapshot(database, sale.id);
  const paymentRows = database.sqlite
    .prepare(
      `SELECT id, sale_id, method, amount_cents, voucher_id, voucher_code
       FROM sale_payments
       WHERE sale_id = ?`,
    )
    .all(sale.id) as SalePaymentRow[];
  const cancelledAt = Date.now();

  database.sqlite.transaction(() => {
    for (const consumption of consumptions) {
      database.sqlite
        .prepare(
          `INSERT INTO event_stock (event_id, product_id, quantity, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(event_id, product_id)
           DO UPDATE SET quantity = quantity + excluded.quantity,
                         updated_at = excluded.updated_at`,
        )
        .run(eventId, consumption.productId, consumption.quantity, cancelledAt);
      database.sqlite
        .prepare(
          `INSERT INTO stock_movements
           (id, event_id, product_id, type, quantity, delta, note, created_at)
           VALUES (?, ?, ?, 'sale-cancel', ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          eventId,
          consumption.productId,
          consumption.quantity,
          consumption.quantity,
          `Cancelamento da venda ${sale.id}`,
          cancelledAt,
        );
    }

    for (const payment of paymentRows) {
      if (payment.method === 'voucher') {
        if (payment.voucher_id === null) {
          throw new Error('O pagamento por voucher está sem referência de saldo.');
        }

        refundVoucher(database, {
          voucherId: payment.voucher_id,
          amountCents: payment.amount_cents,
          saleId: sale.id,
          createdAt: cancelledAt,
        });
        continue;
      }

      recordCashMovement(database, {
        sessionId: session.id,
        eventId,
        type: 'refund',
        method: payment.method,
        amountCents: payment.amount_cents,
        note: input.reason.trim(),
        sourceId: payment.id,
        createdAt: cancelledAt,
      });
    }

    database.sqlite
      .prepare(
        `UPDATE sales
         SET status = 'cancelled', cancelled_at = ?, cancellation_reason = ?
         WHERE id = ?`,
      )
      .run(cancelledAt, input.reason.trim(), sale.id);
    appendAudit(database, {
      action: 'sale.cancelled',
      entityType: 'sale',
      entityId: sale.id,
      eventId,
      details: {
        consumptions,
        reason: input.reason.trim(),
        refundedPayments: paymentRows.map((payment) => ({
          amountCents: payment.amount_cents,
          method: payment.method,
        })),
      },
    });
  })();

  return getSale(database, sale.id);
}
