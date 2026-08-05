import { randomUUID } from 'node:crypto';

import { appendAudit } from './audit';
import { getSessionState } from './control';
import type { DatabaseContext } from './types';

export type DatabaseCashMethod = 'card' | 'pix' | 'cash';
export type DatabaseCashMovementType =
  | 'opening'
  | 'supply'
  | 'withdrawal'
  | 'sale'
  | 'refund'
  | 'expense'
  | 'expense-reversal';

export interface DatabaseCashSession {
  readonly id: string;
  readonly eventId: string;
  readonly status: 'open' | 'closed';
  readonly openingFloatCents: number;
  readonly countedClosingCents: number | null;
  readonly openedAt: number;
  readonly closedAt: number | null;
}

export interface DatabaseCashSummary {
  readonly session: DatabaseCashSession | null;
  readonly commercialRevenueCents: number;
  readonly actualInflowCents: number;
  readonly cashSalesCents: number;
  readonly pixSalesCents: number;
  readonly cardSalesCents: number;
  readonly voucherRedemptionCents: number;
  readonly suppliesCents: number;
  readonly withdrawalsCents: number;
  readonly expensesPaidCents: number;
  readonly refundsCents: number;
  readonly expectedCashCents: number;
}

interface CashSessionRow {
  readonly id: string;
  readonly event_id: string;
  readonly status: 'open' | 'closed';
  readonly opening_float_cents: number;
  readonly counted_closing_cents: number | null;
  readonly opened_at: number;
  readonly closed_at: number | null;
}

interface AggregateRow {
  readonly cash_sales_cents: number;
  readonly pix_sales_cents: number;
  readonly card_sales_cents: number;
  readonly supplies_cents: number;
  readonly withdrawals_cents: number;
  readonly expenses_paid_cents: number;
  readonly expense_reversals_cents: number;
  readonly refunds_cents: number;
  readonly cash_refunds_cents: number;
  readonly cash_expenses_cents: number;
  readonly cash_expense_reversals_cents: number;
}

function requireProduction(database: DatabaseContext): void {
  if (getSessionState(database).profile !== 'production') {
    throw new Error('Esta operação de caixa exige o perfil Produção.');
  }
}

function requireActiveEventId(database: DatabaseContext): string {
  const eventId = getSessionState(database).activeEvent?.id;

  if (eventId === undefined) {
    throw new Error('Selecione um evento aberto para operar o caixa.');
  }

  return eventId;
}

function mapSession(row: CashSessionRow): DatabaseCashSession {
  return {
    id: row.id,
    eventId: row.event_id,
    status: row.status,
    openingFloatCents: row.opening_float_cents,
    countedClosingCents: row.counted_closing_cents,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
  };
}

function getLatestSession(database: DatabaseContext, eventId: string): DatabaseCashSession | null {
  const row = database.sqlite
    .prepare(
      `SELECT id, event_id, status, opening_float_cents, counted_closing_cents,
              opened_at, closed_at
       FROM cash_sessions
       WHERE event_id = ?
       ORDER BY opened_at DESC
       LIMIT 1`,
    )
    .get(eventId) as CashSessionRow | undefined;
  return row === undefined ? null : mapSession(row);
}

export function requireOpenCashSession(
  database: DatabaseContext,
  eventId: string,
): DatabaseCashSession {
  const row = database.sqlite
    .prepare(
      `SELECT id, event_id, status, opening_float_cents, counted_closing_cents,
              opened_at, closed_at
       FROM cash_sessions
       WHERE event_id = ? AND status = 'open'
       LIMIT 1`,
    )
    .get(eventId) as CashSessionRow | undefined;

  if (row === undefined) {
    throw new Error('Abra o caixa do evento antes de registrar movimentações.');
  }

  return mapSession(row);
}

export function recordCashMovement(
  database: DatabaseContext,
  input: {
    readonly sessionId: string;
    readonly eventId: string;
    readonly type: DatabaseCashMovementType;
    readonly method: DatabaseCashMethod | null;
    readonly amountCents: number;
    readonly note: string | null;
    readonly sourceId: string | null;
    readonly createdAt?: number;
  },
): string {
  const movementId = randomUUID();
  database.sqlite
    .prepare(
      `INSERT INTO cash_movements
       (id, session_id, event_id, type, method, amount_cents, note, source_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      movementId,
      input.sessionId,
      input.eventId,
      input.type,
      input.method,
      input.amountCents,
      input.note,
      input.sourceId,
      input.createdAt ?? Date.now(),
    );
  return movementId;
}

function getMovementAggregates(database: DatabaseContext, sessionId: string): AggregateRow {
  return database.sqlite
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'sale' AND method = 'cash' THEN amount_cents ELSE 0 END), 0)
           AS cash_sales_cents,
         COALESCE(SUM(CASE WHEN type = 'sale' AND method = 'pix' THEN amount_cents ELSE 0 END), 0)
           AS pix_sales_cents,
         COALESCE(SUM(CASE WHEN type = 'sale' AND method = 'card' THEN amount_cents ELSE 0 END), 0)
           AS card_sales_cents,
         COALESCE(SUM(CASE WHEN type = 'supply' THEN amount_cents ELSE 0 END), 0)
           AS supplies_cents,
         COALESCE(SUM(CASE WHEN type = 'withdrawal' THEN amount_cents ELSE 0 END), 0)
           AS withdrawals_cents,
         COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0)
           AS expenses_paid_cents,
         COALESCE(SUM(CASE WHEN type = 'expense-reversal' THEN amount_cents ELSE 0 END), 0)
           AS expense_reversals_cents,
         COALESCE(SUM(CASE WHEN type = 'refund' THEN amount_cents ELSE 0 END), 0)
           AS refunds_cents,
         COALESCE(SUM(CASE WHEN type = 'refund' AND method = 'cash' THEN amount_cents ELSE 0 END), 0)
           AS cash_refunds_cents,
         COALESCE(SUM(CASE WHEN type = 'expense' AND method = 'cash' THEN amount_cents ELSE 0 END), 0)
           AS cash_expenses_cents,
         COALESCE(SUM(CASE WHEN type = 'expense-reversal' AND method = 'cash' THEN amount_cents ELSE 0 END), 0)
           AS cash_expense_reversals_cents
       FROM cash_movements
       WHERE session_id = ?`,
    )
    .get(sessionId) as AggregateRow;
}

export function getCashSummary(database: DatabaseContext): DatabaseCashSummary {
  const eventId = getSessionState(database).activeEvent?.id;

  if (eventId === undefined) {
    return {
      session: null,
      commercialRevenueCents: 0,
      actualInflowCents: 0,
      cashSalesCents: 0,
      pixSalesCents: 0,
      cardSalesCents: 0,
      voucherRedemptionCents: 0,
      suppliesCents: 0,
      withdrawalsCents: 0,
      expensesPaidCents: 0,
      refundsCents: 0,
      expectedCashCents: 0,
    };
  }

  const session = getLatestSession(database, eventId);
  const revenueRow = database.sqlite
    .prepare(
      `SELECT
         COALESCE(SUM(total_cents), 0) AS commercial_revenue_cents,
         COALESCE(SUM(
           CASE WHEN sp.method = 'voucher' THEN sp.amount_cents ELSE 0 END
         ), 0) AS voucher_redemption_cents
       FROM sales s
       LEFT JOIN sale_payments sp ON sp.sale_id = s.id
       WHERE s.event_id = ? AND s.status = 'paid'`,
    )
    .get(eventId) as {
    readonly commercial_revenue_cents: number;
    readonly voucher_redemption_cents: number;
  };

  if (session === null) {
    return {
      session: null,
      commercialRevenueCents: revenueRow.commercial_revenue_cents,
      actualInflowCents: 0,
      cashSalesCents: 0,
      pixSalesCents: 0,
      cardSalesCents: 0,
      voucherRedemptionCents: revenueRow.voucher_redemption_cents,
      suppliesCents: 0,
      withdrawalsCents: 0,
      expensesPaidCents: 0,
      refundsCents: 0,
      expectedCashCents: 0,
    };
  }

  const aggregate = getMovementAggregates(database, session.id);
  const actualInflowCents =
    aggregate.cash_sales_cents +
    aggregate.pix_sales_cents +
    aggregate.card_sales_cents -
    aggregate.refunds_cents;
  const expectedCashCents =
    session.openingFloatCents +
    aggregate.cash_sales_cents +
    aggregate.supplies_cents +
    aggregate.cash_expense_reversals_cents -
    aggregate.withdrawals_cents -
    aggregate.cash_expenses_cents -
    aggregate.cash_refunds_cents;

  return {
    session,
    commercialRevenueCents: revenueRow.commercial_revenue_cents,
    actualInflowCents,
    cashSalesCents: aggregate.cash_sales_cents,
    pixSalesCents: aggregate.pix_sales_cents,
    cardSalesCents: aggregate.card_sales_cents,
    voucherRedemptionCents: revenueRow.voucher_redemption_cents,
    suppliesCents: aggregate.supplies_cents,
    withdrawalsCents: aggregate.withdrawals_cents,
    expensesPaidCents: aggregate.expenses_paid_cents - aggregate.expense_reversals_cents,
    refundsCents: aggregate.refunds_cents,
    expectedCashCents,
  };
}

export function openCashSession(
  database: DatabaseContext,
  openingFloatCents: number,
): DatabaseCashSummary {
  requireProduction(database);
  const eventId = requireActiveEventId(database);

  if (!Number.isInteger(openingFloatCents) || openingFloatCents < 0) {
    throw new Error('O fundo inicial deve ser um valor válido.');
  }

  const existing = database.sqlite
    .prepare("SELECT id FROM cash_sessions WHERE event_id = ? AND status = 'open'")
    .get(eventId);

  if (existing !== undefined) {
    throw new Error('O caixa deste evento já está aberto.');
  }

  const sessionId = randomUUID();
  const openedAt = Date.now();

  database.sqlite.transaction(() => {
    database.sqlite
      .prepare(
        `INSERT INTO cash_sessions
         (id, event_id, status, opening_float_cents, counted_closing_cents, opened_at, closed_at)
         VALUES (?, ?, 'open', ?, NULL, ?, NULL)`,
      )
      .run(sessionId, eventId, openingFloatCents, openedAt);

    if (openingFloatCents > 0) {
      recordCashMovement(database, {
        sessionId,
        eventId,
        type: 'opening',
        method: 'cash',
        amountCents: openingFloatCents,
        note: 'Fundo inicial',
        sourceId: null,
        createdAt: openedAt,
      });
    }

    appendAudit(database, {
      action: 'cash.opened',
      entityType: 'cash-session',
      entityId: sessionId,
      eventId,
      details: { openingFloatCents },
    });
  })();

  return getCashSummary(database);
}

export function closeCashSession(
  database: DatabaseContext,
  countedClosingCents: number,
): DatabaseCashSummary {
  requireProduction(database);
  const eventId = requireActiveEventId(database);
  const session = requireOpenCashSession(database, eventId);

  if (!Number.isInteger(countedClosingCents) || countedClosingCents < 0) {
    throw new Error('Informe um valor contado válido.');
  }

  const closedAt = Date.now();
  const expectedCashCents = getCashSummary(database).expectedCashCents;

  database.sqlite.transaction(() => {
    database.sqlite
      .prepare(
        `UPDATE cash_sessions
         SET status = 'closed', counted_closing_cents = ?, closed_at = ?
         WHERE id = ?`,
      )
      .run(countedClosingCents, closedAt, session.id);
    appendAudit(database, {
      action: 'cash.closed',
      entityType: 'cash-session',
      entityId: session.id,
      eventId,
      details: {
        countedClosingCents,
        differenceCents: countedClosingCents - expectedCashCents,
        expectedCashCents,
      },
    });
  })();

  return getCashSummary(database);
}

export function addManualCashMovement(
  database: DatabaseContext,
  input: {
    readonly type: 'supply' | 'withdrawal';
    readonly amountCents: number;
    readonly note: string;
  },
): DatabaseCashSummary {
  requireProduction(database);
  const eventId = requireActiveEventId(database);
  const session = requireOpenCashSession(database, eventId);

  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error('O valor da movimentação deve ser positivo.');
  }

  if (input.type === 'withdrawal' && getCashSummary(database).expectedCashCents < input.amountCents) {
    throw new Error('A sangria não pode superar o saldo esperado em dinheiro.');
  }

  const movementId = database.sqlite.transaction(() => {
    const id = recordCashMovement(database, {
      sessionId: session.id,
      eventId,
      type: input.type,
      method: 'cash',
      amountCents: input.amountCents,
      note: input.note.trim(),
      sourceId: null,
    });
    appendAudit(database, {
      action: input.type === 'supply' ? 'cash.supplied' : 'cash.withdrawn',
      entityType: 'cash-movement',
      entityId: id,
      eventId,
      details: { amountCents: input.amountCents, note: input.note.trim() },
    });
    return id;
  })();

  void movementId;
  return getCashSummary(database);
}
