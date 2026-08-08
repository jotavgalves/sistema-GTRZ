import { appendAudit } from './audit';
import { getSessionState } from './control';
import { cancelOrder } from './operation-cancellation';
import { ensureProductExperienceSchema } from './product-experience-migration';
import type { DatabaseContext } from './types';

export type DatabaseProductFallbackIcon =
  | 'package'
  | 'beer'
  | 'cup-soda'
  | 'coffee'
  | 'sandwich'
  | 'pizza'
  | 'ice-cream'
  | 'glass-water'
  | 'candy';

export type DatabaseProductDeletionMode = 'keep-sales-history' | 'refund-active-event-sales';

export interface DatabaseProductAdministration {
  readonly productId: string;
  readonly imageDataUrl: string | null;
  readonly fallbackIcon: DatabaseProductFallbackIcon;
  readonly currentStockValueCents: number;
  readonly contributedCostCents: number;
}

export interface DatabaseProductDeletionImpact {
  readonly productId: string;
  readonly productName: string;
  readonly currentQuantity: number;
  readonly openOrdersCount: number;
  readonly paidOrdersInActiveEventCount: number;
  readonly paidOrdersHistoricalCount: number;
  readonly stockMovementsCount: number;
  readonly stockTransfersCount: number;
  readonly affectedCombosCount: number;
}

export interface DatabaseProductDeletionResult {
  readonly productId: string;
  readonly deleted: true;
  readonly refundedOrdersCount: number;
  readonly preservedHistoricalOrdersCount: number;
}

const FALLBACK_ICONS = new Set<DatabaseProductFallbackIcon>([
  'package',
  'beer',
  'cup-soda',
  'coffee',
  'sandwich',
  'pizza',
  'ice-cream',
  'glass-water',
  'candy',
]);

function requireProduction(database: DatabaseContext): void {
  if (getSessionState(database).profile !== 'production') {
    throw new Error('A administração de produtos exige o perfil Produção.');
  }
}

function requireProduct(database: DatabaseContext, productId: string): { id: string; name: string } {
  const row = database.sqlite
    .prepare('SELECT id, name FROM products WHERE id = ?')
    .get(productId) as { readonly id: string; readonly name: string } | undefined;

  if (row === undefined) {
    throw new Error('O produto informado não existe.');
  }

  return row;
}

function normalizeImageDataUrl(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  if (value.length > 750_000) {
    throw new Error('A foto do produto ficou muito grande. Escolha outra imagem.');
  }

  if (!/^data:image\/(?:png|jpeg|webp);base64,/i.test(value)) {
    throw new Error('A foto do produto precisa ser PNG, JPG ou WebP.');
  }

  return value;
}

export function listProductAdministration(
  database: DatabaseContext,
): readonly DatabaseProductAdministration[] {
  ensureProductExperienceSchema(database.sqlite);
  const eventId = getSessionState(database).activeEvent?.id ?? null;
  const rows = database.sqlite
    .prepare(
      `SELECT
         p.id AS product_id,
         pp.image_data_url,
         COALESCE(pp.fallback_icon, 'package') AS fallback_icon,
         COALESCE(es.quantity, 0) * p.cost_cents AS current_stock_value_cents,
         COALESCE((
           SELECT SUM(scl.delta_cents)
           FROM stock_cost_ledger scl
           WHERE scl.product_id = p.id AND scl.event_id = ?
         ), 0) AS contributed_cost_cents
       FROM products p
       LEFT JOIN product_presentations pp ON pp.product_id = p.id
       LEFT JOIN event_stock es ON es.product_id = p.id AND es.event_id = ?
       ORDER BY p.name COLLATE NOCASE`,
    )
    .all(eventId, eventId) as Array<{
    readonly product_id: string;
    readonly image_data_url: string | null;
    readonly fallback_icon: DatabaseProductFallbackIcon;
    readonly current_stock_value_cents: number;
    readonly contributed_cost_cents: number;
  }>;

  return rows.map((row) => ({
    productId: row.product_id,
    imageDataUrl: row.image_data_url,
    fallbackIcon: row.fallback_icon,
    currentStockValueCents: Math.max(row.current_stock_value_cents, 0),
    contributedCostCents: Math.max(row.contributed_cost_cents, 0),
  }));
}

export function setProductPresentation(
  database: DatabaseContext,
  input: {
    readonly productId: string;
    readonly imageDataUrl: string | null;
    readonly fallbackIcon: DatabaseProductFallbackIcon;
  },
): DatabaseProductAdministration {
  requireProduction(database);
  ensureProductExperienceSchema(database.sqlite);
  const product = requireProduct(database, input.productId);

  if (!FALLBACK_ICONS.has(input.fallbackIcon)) {
    throw new Error('O ícone escolhido não é válido.');
  }

  const imageDataUrl = normalizeImageDataUrl(input.imageDataUrl);
  const now = Date.now();
  database.sqlite.transaction(() => {
    database.sqlite
      .prepare(
        `INSERT INTO product_presentations
         (product_id, image_data_url, fallback_icon, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(product_id) DO UPDATE SET
           image_data_url = excluded.image_data_url,
           fallback_icon = excluded.fallback_icon,
           updated_at = excluded.updated_at`,
      )
      .run(product.id, imageDataUrl, input.fallbackIcon, now);
    appendAudit(database, {
      action: 'inventory.product-presentation-updated',
      entityType: 'product',
      entityId: product.id,
      details: {
        fallbackIcon: input.fallbackIcon,
        hasImage: imageDataUrl !== null,
        name: product.name,
      },
    });
  })();

  const result = listProductAdministration(database).find((item) => item.productId === product.id);
  if (result === undefined) {
    throw new Error('A apresentação do produto foi salva, mas não pôde ser carregada.');
  }
  return result;
}

function orderPredicate(): string {
  return `(
    (oi.item_kind = 'product' AND oi.item_id = ?)
    OR
    (oi.item_kind = 'combo' AND oi.item_id IN (
      SELECT combo_id FROM combo_components WHERE product_id = ?
    ))
  )`;
}

export function previewProductDeletion(
  database: DatabaseContext,
  productId: string,
): DatabaseProductDeletionImpact {
  requireProduction(database);
  ensureProductExperienceSchema(database.sqlite);
  const product = requireProduct(database, productId);
  const activeEventId = getSessionState(database).activeEvent?.id ?? null;
  const currentQuantityRow = database.sqlite
    .prepare('SELECT COALESCE(SUM(quantity), 0) AS quantity FROM event_stock WHERE product_id = ?')
    .get(productId) as { readonly quantity: number };
  const countOrders = (status: 'open' | 'paid', eventId?: string | null): number => {
    const eventClause = eventId === undefined ? '' : 'AND o.event_id = ?';
    const params: unknown[] = [productId, productId, status];
    if (eventId !== undefined) params.push(eventId);
    const row = database.sqlite
      .prepare(
        `SELECT COUNT(DISTINCT o.id) AS amount
         FROM orders o
         INNER JOIN order_items oi ON oi.order_id = o.id
         WHERE ${orderPredicate()} AND o.status = ? ${eventClause}`,
      )
      .get(...params) as { readonly amount: number };
    return row.amount;
  };
  const stockMovements = database.sqlite
    .prepare('SELECT COUNT(*) AS amount FROM stock_movements WHERE product_id = ?')
    .get(productId) as { readonly amount: number };
  const transfers = database.sqlite
    .prepare('SELECT COUNT(*) AS amount FROM stock_transfers WHERE product_id = ?')
    .get(productId) as { readonly amount: number };
  const combos = database.sqlite
    .prepare('SELECT COUNT(*) AS amount FROM combo_components WHERE product_id = ?')
    .get(productId) as { readonly amount: number };

  return {
    productId,
    productName: product.name,
    currentQuantity: currentQuantityRow.quantity,
    openOrdersCount: countOrders('open'),
    paidOrdersInActiveEventCount:
      activeEventId === null ? 0 : countOrders('paid', activeEventId),
    paidOrdersHistoricalCount: countOrders('paid'),
    stockMovementsCount: stockMovements.amount,
    stockTransfersCount: transfers.amount,
    affectedCombosCount: combos.amount,
  };
}

export function deleteInventoryProduct(
  database: DatabaseContext,
  input: {
    readonly productId: string;
    readonly mode: DatabaseProductDeletionMode;
    readonly reason: string;
  },
): DatabaseProductDeletionResult {
  requireProduction(database);
  ensureProductExperienceSchema(database.sqlite);
  const product = requireProduct(database, input.productId);
  const impact = previewProductDeletion(database, product.id);
  const reason = input.reason.trim();

  if (impact.openOrdersCount > 0) {
    throw new Error(
      `O produto ainda está em ${String(impact.openOrdersCount)} comanda(s) aberta(s). Remova-o dessas comandas antes de excluir.`,
    );
  }

  const activeEventId = getSessionState(database).activeEvent?.id ?? null;
  let refundedOrdersCount = 0;

  if (input.mode === 'refund-active-event-sales') {
    if (activeEventId === null) {
      throw new Error('Selecione o evento das vendas que deseja estornar.');
    }

    const rows = database.sqlite
      .prepare(
        `SELECT DISTINCT o.id
         FROM orders o
         INNER JOIN order_items oi ON oi.order_id = o.id
         WHERE ${orderPredicate()} AND o.status = 'paid' AND o.event_id = ?`,
      )
      .all(product.id, product.id, activeEventId) as { readonly id: string }[];

    for (const row of rows) {
      cancelOrder(database, {
        orderId: row.id,
        reason: `Exclusão do produto ${product.name}: ${reason}`,
      });
      refundedOrdersCount += 1;
    }
  }

  const now = Date.now();
  database.sqlite.transaction(() => {
    const affectedCombos = database.sqlite
      .prepare('SELECT combo_id FROM combo_components WHERE product_id = ?')
      .all(product.id) as { readonly combo_id: string }[];

    for (const combo of affectedCombos) {
      database.sqlite
        .prepare('UPDATE combos SET active = 0, updated_at = ? WHERE id = ?')
        .run(now, combo.combo_id);
    }

    database.sqlite.prepare('DELETE FROM combo_components WHERE product_id = ?').run(product.id);
    database.sqlite.prepare('DELETE FROM stock_transfers WHERE product_id = ?').run(product.id);
    database.sqlite.prepare('DELETE FROM stock_movements WHERE product_id = ?').run(product.id);
    database.sqlite.prepare('DELETE FROM event_stock WHERE product_id = ?').run(product.id);
    database.sqlite.prepare('DELETE FROM product_presentations WHERE product_id = ?').run(product.id);
    database.sqlite.prepare('DELETE FROM products WHERE id = ?').run(product.id);

    appendAudit(database, {
      action: 'inventory.product-deleted',
      entityType: 'product',
      entityId: product.id,
      eventId: activeEventId,
      details: {
        affectedCombosCount: impact.affectedCombosCount,
        mode: input.mode,
        name: product.name,
        preservedHistoricalOrdersCount: Math.max(
          impact.paidOrdersHistoricalCount - refundedOrdersCount,
          0,
        ),
        reason,
        refundedOrdersCount,
        removedStockMovementsCount: impact.stockMovementsCount,
        removedStockTransfersCount: impact.stockTransfersCount,
      },
    });
  })();

  return {
    productId: product.id,
    deleted: true,
    refundedOrdersCount,
    preservedHistoricalOrdersCount: Math.max(
      impact.paidOrdersHistoricalCount - refundedOrdersCount,
      0,
    ),
  };
}
