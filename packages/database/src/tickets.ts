import { randomBytes, randomUUID } from 'node:crypto';

import { appendAudit } from './audit';
import { getSessionState } from './control';
import type { DatabasePaymentMethod } from './operation-types';
import type { DatabaseContext } from './types';

export type DatabaseTicketSaleSource = 'sympla' | 'whatsapp' | 'door' | 'courtesy';
export type DatabaseTicketSaleStatus = 'active' | 'cancelled';
export type DatabaseTicketCodeStatus = 'valid' | 'cancelled';

export interface DatabaseTicketLot {
  readonly id: string;
  readonly eventId: string;
  readonly name: string;
  readonly priceCents: number;
  readonly capacity: number;
  readonly soldQuantity: number;
  readonly courtesyQuantity: number;
  readonly availableQuantity: number;
  readonly active: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface DatabaseTicketCode {
  readonly id: string;
  readonly saleId: string;
  readonly code: string;
  readonly status: DatabaseTicketCodeStatus;
  readonly createdAt: number;
}

export interface DatabaseTicketSale {
  readonly id: string;
  readonly eventId: string;
  readonly lotId: string;
  readonly lotName: string;
  readonly attendeeName: string;
  readonly source: DatabaseTicketSaleSource;
  readonly quantity: number;
  readonly unitPriceCents: number;
  readonly totalCents: number;
  readonly paymentMethod: DatabasePaymentMethod | null;
  readonly status: DatabaseTicketSaleStatus;
  readonly codes: readonly DatabaseTicketCode[];
  readonly createdAt: number;
  readonly cancelledAt: number | null;
  readonly updatedAt: number;
}

export interface DatabaseTicketState {
  readonly activeEventId: string | null;
  readonly lots: readonly DatabaseTicketLot[];
  readonly sales: readonly DatabaseTicketSale[];
  readonly activeRevenueCents: number;
}

interface TicketLotRow {
  readonly id: string;
  readonly event_id: string;
  readonly name: string;
  readonly price_cents: number;
  readonly capacity: number;
  readonly active: number;
  readonly sold_quantity: number;
  readonly courtesy_quantity: number;
  readonly created_at: number;
  readonly updated_at: number;
}

interface TicketSaleRow {
  readonly id: string;
  readonly event_id: string;
  readonly lot_id: string;
  readonly lot_name: string;
  readonly attendee_name: string;
  readonly source: DatabaseTicketSaleSource;
  readonly quantity: number;
  readonly unit_price_cents: number;
  readonly total_cents: number;
  readonly payment_method: DatabasePaymentMethod | null;
  readonly status: DatabaseTicketSaleStatus;
  readonly created_at: number;
  readonly cancelled_at: number | null;
  readonly updated_at: number;
}

interface TicketCodeRow {
  readonly id: string;
  readonly sale_id: string;
  readonly code: string;
  readonly status: DatabaseTicketCodeStatus;
  readonly created_at: number;
}

function requireProduction(database: DatabaseContext): void {
  if (getSessionState(database).profile !== 'production') {
    throw new Error('A administração de ingressos exige o perfil Produção.');
  }
}

function requireActiveEvent(database: DatabaseContext): string {
  const eventId = getSessionState(database).activeEvent?.id;

  if (eventId === undefined) {
    throw new Error('Selecione um evento aberto antes de administrar ingressos.');
  }

  return eventId;
}

function mapLot(row: TicketLotRow): DatabaseTicketLot {
  const consumed = row.sold_quantity + row.courtesy_quantity;
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    priceCents: row.price_cents,
    capacity: row.capacity,
    soldQuantity: row.sold_quantity,
    courtesyQuantity: row.courtesy_quantity,
    availableQuantity: Math.max(row.capacity - consumed, 0),
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCode(row: TicketCodeRow): DatabaseTicketCode {
  return {
    id: row.id,
    saleId: row.sale_id,
    code: row.code,
    status: row.status,
    createdAt: row.created_at,
  };
}

function listCodes(database: DatabaseContext, saleId: string): readonly DatabaseTicketCode[] {
  const rows = database.sqlite
    .prepare(
      `SELECT id, sale_id, code, status, created_at
       FROM ticket_codes
       WHERE sale_id = ?
       ORDER BY created_at, code COLLATE NOCASE`,
    )
    .all(saleId) as TicketCodeRow[];
  return rows.map(mapCode);
}

function mapSale(database: DatabaseContext, row: TicketSaleRow): DatabaseTicketSale {
  return {
    id: row.id,
    eventId: row.event_id,
    lotId: row.lot_id,
    lotName: row.lot_name,
    attendeeName: row.attendee_name,
    source: row.source,
    quantity: row.quantity,
    unitPriceCents: row.unit_price_cents,
    totalCents: row.total_cents,
    paymentMethod: row.payment_method,
    status: row.status,
    codes: listCodes(database, row.id),
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
    updatedAt: row.updated_at,
  };
}

function listLots(database: DatabaseContext, eventId: string): readonly DatabaseTicketLot[] {
  const rows = database.sqlite
    .prepare(
      `SELECT
         tl.id,
         tl.event_id,
         tl.name,
         tl.price_cents,
         tl.capacity,
         tl.active,
         COALESCE(SUM(CASE
           WHEN ts.status = 'active' AND ts.source != 'courtesy' THEN ts.quantity ELSE 0 END), 0)
           AS sold_quantity,
         COALESCE(SUM(CASE
           WHEN ts.status = 'active' AND ts.source = 'courtesy' THEN ts.quantity ELSE 0 END), 0)
           AS courtesy_quantity,
         tl.created_at,
         tl.updated_at
       FROM ticket_lots tl
       LEFT JOIN ticket_sales ts ON ts.lot_id = tl.id
       WHERE tl.event_id = ?
       GROUP BY tl.id
       ORDER BY tl.active DESC, tl.created_at, tl.name COLLATE NOCASE`,
    )
    .all(eventId) as TicketLotRow[];
  return rows.map(mapLot);
}

function listSales(database: DatabaseContext, eventId: string): readonly DatabaseTicketSale[] {
  const rows = database.sqlite
    .prepare(
      `SELECT id, event_id, lot_id, lot_name, attendee_name, source, quantity,
              unit_price_cents, total_cents, payment_method, status, created_at,
              cancelled_at, updated_at
       FROM ticket_sales
       WHERE event_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 200`,
    )
    .all(eventId) as TicketSaleRow[];
  return rows.map((row) => mapSale(database, row));
}

function requireLot(database: DatabaseContext, eventId: string, lotId: string): DatabaseTicketLot {
  const lot = listLots(database, eventId).find((candidate) => candidate.id === lotId);

  if (lot === undefined) {
    throw new Error('O lote informado não existe no evento ativo.');
  }

  return lot;
}

function requireSale(database: DatabaseContext, saleId: string): TicketSaleRow {
  const row = database.sqlite
    .prepare(
      `SELECT id, event_id, lot_id, lot_name, attendee_name, source, quantity,
              unit_price_cents, total_cents, payment_method, status, created_at,
              cancelled_at, updated_at
       FROM ticket_sales WHERE id = ?`,
    )
    .get(saleId) as TicketSaleRow | undefined;

  if (row === undefined) {
    throw new Error('A venda de ingresso informada não existe.');
  }

  return row;
}

function requireUniqueLotName(
  database: DatabaseContext,
  eventId: string,
  name: string,
  excludedId?: string,
): void {
  const duplicate = database.sqlite
    .prepare(
      `SELECT id FROM ticket_lots
       WHERE event_id = ? AND name = ? COLLATE NOCASE
         AND (? IS NULL OR id != ?)`,
    )
    .get(eventId, name, excludedId ?? null, excludedId ?? null);

  if (duplicate !== undefined) {
    throw new Error('Já existe um lote com esse nome no evento.');
  }
}

function normalizeCode(code: string): string {
  return code.trim().toLocaleUpperCase('pt-BR').replaceAll(/\s+/gu, '-');
}

function generateCode(): string {
  return `TKT-${randomBytes(6).toString('hex').toLocaleUpperCase('pt-BR')}`;
}

function ensureUniqueCodes(database: DatabaseContext, eventId: string, codes: readonly string[]): void {
  if (new Set(codes).size !== codes.length) {
    throw new Error('Os códigos da venda precisam ser únicos.');
  }

  const findCode = database.sqlite.prepare(
    'SELECT id FROM ticket_codes WHERE event_id = ? AND code = ? COLLATE NOCASE',
  );

  for (const code of codes) {
    if (findCode.get(eventId, code) !== undefined) {
      throw new Error(`O código ${code} já foi utilizado neste evento.`);
    }
  }
}

export function getTicketState(database: DatabaseContext): DatabaseTicketState {
  const eventId = getSessionState(database).activeEvent?.id ?? null;

  if (eventId === null) {
    return { activeEventId: null, lots: [], sales: [], activeRevenueCents: 0 };
  }

  const sales = listSales(database, eventId);
  return {
    activeEventId: eventId,
    lots: listLots(database, eventId),
    sales,
    activeRevenueCents: sales
      .filter((sale) => sale.status === 'active')
      .reduce((total, sale) => total + sale.totalCents, 0),
  };
}

export function createTicketLot(
  database: DatabaseContext,
  input: { readonly name: string; readonly priceCents: number; readonly capacity: number },
): DatabaseTicketLot {
  requireProduction(database);
  const eventId = requireActiveEvent(database);
  const name = input.name.trim();
  requireUniqueLotName(database, eventId, name);

  if (!Number.isInteger(input.priceCents) || input.priceCents < 0) {
    throw new Error('O preço do lote deve ser um inteiro não negativo.');
  }

  if (!Number.isInteger(input.capacity) || input.capacity <= 0) {
    throw new Error('A capacidade do lote deve ser positiva.');
  }

  const lotId = randomUUID();
  const now = Date.now();
  database.sqlite.transaction(() => {
    database.sqlite
      .prepare(
        `INSERT INTO ticket_lots
         (id, event_id, name, price_cents, capacity, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(lotId, eventId, name, input.priceCents, input.capacity, now, now);
    appendAudit(database, {
      action: 'ticket.lot-created',
      entityType: 'ticket-lot',
      entityId: lotId,
      eventId,
      details: { capacity: input.capacity, name, priceCents: input.priceCents },
    });
  })();

  return requireLot(database, eventId, lotId);
}

export function updateTicketLot(
  database: DatabaseContext,
  input: {
    readonly lotId: string;
    readonly name: string;
    readonly priceCents: number;
    readonly capacity: number;
    readonly active: boolean;
  },
): DatabaseTicketLot {
  requireProduction(database);
  const eventId = requireActiveEvent(database);
  const before = requireLot(database, eventId, input.lotId);
  const name = input.name.trim();
  requireUniqueLotName(database, eventId, name, input.lotId);
  const consumed = before.soldQuantity + before.courtesyQuantity;

  if (!Number.isInteger(input.capacity) || input.capacity < consumed) {
    throw new Error(`A capacidade não pode ser menor que os ${String(consumed)} ingressos ativos.`);
  }

  if (!Number.isInteger(input.priceCents) || input.priceCents < 0) {
    throw new Error('O preço do lote deve ser um inteiro não negativo.');
  }

  const now = Date.now();
  database.sqlite.transaction(() => {
    database.sqlite
      .prepare(
        `UPDATE ticket_lots
         SET name = ?, price_cents = ?, capacity = ?, active = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(name, input.priceCents, input.capacity, input.active ? 1 : 0, now, input.lotId);
    appendAudit(database, {
      action: 'ticket.lot-updated',
      entityType: 'ticket-lot',
      entityId: input.lotId,
      eventId,
      details: { after: { ...input, name }, before },
    });
  })();

  return requireLot(database, eventId, input.lotId);
}

export function createTicketSale(
  database: DatabaseContext,
  input: {
    readonly lotId: string;
    readonly attendeeName: string;
    readonly source: DatabaseTicketSaleSource;
    readonly quantity: number;
    readonly paymentMethod?: DatabasePaymentMethod;
    readonly manualCodes?: readonly string[];
  },
): DatabaseTicketSale {
  requireProduction(database);
  const eventId = requireActiveEvent(database);
  const lot = requireLot(database, eventId, input.lotId);

  if (!lot.active) {
    throw new Error('O lote está inativo e não aceita novas vendas.');
  }

  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new Error('A quantidade de ingressos deve ser positiva.');
  }

  if (lot.availableQuantity < input.quantity) {
    throw new Error(`Capacidade insuficiente. Disponível: ${String(lot.availableQuantity)}.`);
  }

  if (input.source === 'courtesy' && input.paymentMethod !== undefined) {
    throw new Error('Cortesias não possuem forma de pagamento.');
  }

  if (input.source !== 'courtesy' && input.paymentMethod === undefined) {
    throw new Error('Informe a forma de pagamento da venda.');
  }

  if (input.manualCodes !== undefined && input.manualCodes.length !== input.quantity) {
    throw new Error('A quantidade de códigos deve ser igual à quantidade de ingressos.');
  }

  const codes = (input.manualCodes ?? Array.from({ length: input.quantity }, generateCode)).map(
    normalizeCode,
  );
  ensureUniqueCodes(database, eventId, codes);
  const saleId = randomUUID();
  const attendeeName = input.attendeeName.trim();
  const unitPriceCents = input.source === 'courtesy' ? 0 : lot.priceCents;
  const totalCents = unitPriceCents * input.quantity;
  const now = Date.now();

  database.sqlite.transaction(() => {
    database.sqlite
      .prepare(
        `INSERT INTO ticket_sales
         (id, event_id, lot_id, lot_name, attendee_name, source, quantity,
          unit_price_cents, total_cents, payment_method, status,
          created_at, cancelled_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NULL, ?)`,
      )
      .run(
        saleId,
        eventId,
        lot.id,
        lot.name,
        attendeeName,
        input.source,
        input.quantity,
        unitPriceCents,
        totalCents,
        input.paymentMethod ?? null,
        now,
        now,
      );
    const insertCode = database.sqlite.prepare(
      `INSERT INTO ticket_codes (id, event_id, sale_id, code, status, created_at)
       VALUES (?, ?, ?, ?, 'valid', ?)`,
    );

    for (const code of codes) {
      insertCode.run(randomUUID(), eventId, saleId, code, now);
    }

    appendAudit(database, {
      action: input.source === 'courtesy' ? 'ticket.courtesy-created' : 'ticket.sale-created',
      entityType: 'ticket-sale',
      entityId: saleId,
      eventId,
      details: {
        attendeeName,
        codes,
        lotId: lot.id,
        paymentMethod: input.paymentMethod ?? null,
        quantity: input.quantity,
        source: input.source,
        totalCents,
      },
    });
  })();

  return mapSale(database, requireSale(database, saleId));
}

export function cancelTicketSale(
  database: DatabaseContext,
  input: { readonly saleId: string; readonly reason: string },
): DatabaseTicketSale {
  requireProduction(database);
  const eventId = requireActiveEvent(database);
  const sale = requireSale(database, input.saleId);

  if (sale.event_id !== eventId) {
    throw new Error('A venda não pertence ao evento ativo.');
  }

  if (sale.status === 'cancelled') {
    throw new Error('Esta venda de ingresso já foi cancelada.');
  }

  const reason = input.reason.trim();
  const now = Date.now();
  database.sqlite.transaction(() => {
    database.sqlite
      .prepare(
        `UPDATE ticket_sales
         SET status = 'cancelled', cancelled_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(now, now, sale.id);
    database.sqlite
      .prepare("UPDATE ticket_codes SET status = 'cancelled' WHERE sale_id = ?")
      .run(sale.id);
    appendAudit(database, {
      action: 'ticket.sale-cancelled',
      entityType: 'ticket-sale',
      entityId: sale.id,
      eventId,
      details: {
        attendeeName: sale.attendee_name,
        quantity: sale.quantity,
        reason,
        totalCents: sale.total_cents,
      },
    });
  })();

  return mapSale(database, requireSale(database, sale.id));
}
