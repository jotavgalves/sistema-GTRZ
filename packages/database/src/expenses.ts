import { randomUUID } from 'node:crypto';

import { appendAudit } from './audit';
import { recordCashMovement, requireOpenCashSession, type DatabaseCashMethod } from './cash';
import { getSessionState } from './control';
import type { DatabaseContext } from './types';

export interface DatabaseExpenseCategory {
  readonly id: string;
  readonly eventId: string;
  readonly name: string;
}

export interface DatabaseExpensePayment {
  readonly id: string;
  readonly method: DatabaseCashMethod;
  readonly amountCents: number;
  readonly note: string | null;
  readonly paidAt: number;
  readonly reversedAt: number | null;
}

export interface DatabaseExpense {
  readonly id: string;
  readonly eventId: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly description: string;
  readonly totalCents: number;
  readonly paidCents: number;
  readonly outstandingCents: number;
  readonly status: 'open' | 'partial' | 'paid';
  readonly dueAt: number | null;
  readonly createdAt: number;
  readonly payments: readonly DatabaseExpensePayment[];
}

export interface DatabaseExpenseState {
  readonly activeEventId: string | null;
  readonly categories: readonly DatabaseExpenseCategory[];
  readonly expenses: readonly DatabaseExpense[];
}

interface CategoryRow {
  readonly id: string;
  readonly event_id: string;
  readonly name: string;
}

interface ExpenseRow {
  readonly id: string;
  readonly event_id: string;
  readonly category_id: string;
  readonly category_name: string;
  readonly description: string;
  readonly total_cents: number;
  readonly due_at: number | null;
  readonly created_at: number;
}

interface PaymentRow {
  readonly id: string;
  readonly expense_id: string;
  readonly method: DatabaseCashMethod;
  readonly amount_cents: number;
  readonly note: string | null;
  readonly paid_at: number;
  readonly reversed_at: number | null;
}

function requireProduction(database: DatabaseContext): void {
  if (getSessionState(database).profile !== 'production') {
    throw new Error('Esta operação de despesa exige o perfil Produção.');
  }
}

function requireActiveEventId(database: DatabaseContext): string {
  const eventId = getSessionState(database).activeEvent?.id;

  if (eventId === undefined) {
    throw new Error('Selecione um evento aberto para operar despesas.');
  }

  return eventId;
}

function mapCategory(row: CategoryRow): DatabaseExpenseCategory {
  return { id: row.id, eventId: row.event_id, name: row.name };
}

function listPaymentRows(database: DatabaseContext, eventId: string): readonly PaymentRow[] {
  return database.sqlite
    .prepare(
      `SELECT ep.id, ep.expense_id, ep.method, ep.amount_cents, ep.note, ep.paid_at, ep.reversed_at
       FROM expense_payments ep
       INNER JOIN expenses e ON e.id = ep.expense_id
       WHERE e.event_id = ?
       ORDER BY ep.paid_at DESC`,
    )
    .all(eventId) as PaymentRow[];
}

function mapExpense(row: ExpenseRow, payments: readonly PaymentRow[]): DatabaseExpense {
  const mappedPayments = payments.map((payment) => ({
    id: payment.id,
    method: payment.method,
    amountCents: payment.amount_cents,
    note: payment.note,
    paidAt: payment.paid_at,
    reversedAt: payment.reversed_at,
  }));
  const paidCents = payments.reduce(
    (total, payment) => total + (payment.reversed_at === null ? payment.amount_cents : 0),
    0,
  );
  const outstandingCents = row.total_cents - paidCents;
  const status = paidCents === 0 ? 'open' : outstandingCents === 0 ? 'paid' : 'partial';

  return {
    id: row.id,
    eventId: row.event_id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    description: row.description,
    totalCents: row.total_cents,
    paidCents,
    outstandingCents,
    status,
    dueAt: row.due_at,
    createdAt: row.created_at,
    payments: mappedPayments,
  };
}

function getExpense(database: DatabaseContext, expenseId: string): DatabaseExpense {
  const row = database.sqlite
    .prepare(
      `SELECT e.id, e.event_id, e.category_id, ec.name AS category_name,
              e.description, e.total_cents, e.due_at, e.created_at
       FROM expenses e
       INNER JOIN expense_categories ec ON ec.id = e.category_id
       WHERE e.id = ?`,
    )
    .get(expenseId) as ExpenseRow | undefined;

  if (row === undefined) {
    throw new Error('A despesa informada não existe.');
  }

  const payments = database.sqlite
    .prepare(
      `SELECT id, expense_id, method, amount_cents, note, paid_at, reversed_at
       FROM expense_payments
       WHERE expense_id = ?
       ORDER BY paid_at DESC`,
    )
    .all(expenseId) as PaymentRow[];
  return mapExpense(row, payments);
}

export function getExpenseState(database: DatabaseContext): DatabaseExpenseState {
  const activeEventId = getSessionState(database).activeEvent?.id ?? null;

  if (activeEventId === null) {
    return { activeEventId: null, categories: [], expenses: [] };
  }

  const categoryRows = database.sqlite
    .prepare(
      `SELECT id, event_id, name
       FROM expense_categories
       WHERE event_id = ?
       ORDER BY name COLLATE NOCASE`,
    )
    .all(activeEventId) as CategoryRow[];
  const expenseRows = database.sqlite
    .prepare(
      `SELECT e.id, e.event_id, e.category_id, ec.name AS category_name,
              e.description, e.total_cents, e.due_at, e.created_at
       FROM expenses e
       INNER JOIN expense_categories ec ON ec.id = e.category_id
       WHERE e.event_id = ?
       ORDER BY e.created_at DESC`,
    )
    .all(activeEventId) as ExpenseRow[];
  const paymentRows = listPaymentRows(database, activeEventId);
  const paymentsByExpense = new Map<string, PaymentRow[]>();

  for (const payment of paymentRows) {
    const grouped = paymentsByExpense.get(payment.expense_id) ?? [];
    grouped.push(payment);
    paymentsByExpense.set(payment.expense_id, grouped);
  }

  return {
    activeEventId,
    categories: categoryRows.map(mapCategory),
    expenses: expenseRows.map((expense) =>
      mapExpense(expense, paymentsByExpense.get(expense.id) ?? []),
    ),
  };
}

export function createExpenseCategory(
  database: DatabaseContext,
  nameInput: string,
): DatabaseExpenseCategory {
  requireProduction(database);
  const eventId = requireActiveEventId(database);
  const name = nameInput.trim();
  const duplicate = database.sqlite
    .prepare('SELECT id FROM expense_categories WHERE event_id = ? AND name = ? COLLATE NOCASE')
    .get(eventId, name);

  if (duplicate !== undefined) {
    throw new Error('Já existe essa categoria de despesa no evento.');
  }

  const categoryId = randomUUID();
  const now = Date.now();
  database.sqlite.transaction(() => {
    database.sqlite
      .prepare(
        `INSERT INTO expense_categories (id, event_id, name, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(categoryId, eventId, name, now);
    appendAudit(database, {
      action: 'expense.category-created',
      entityType: 'expense-category',
      entityId: categoryId,
      eventId,
      details: { name },
    });
  })();
  return { id: categoryId, eventId, name };
}

export function createExpense(
  database: DatabaseContext,
  input: {
    readonly categoryId: string;
    readonly description: string;
    readonly totalCents: number;
    readonly dueAt?: number | null;
  },
): DatabaseExpense {
  requireProduction(database);
  const eventId = requireActiveEventId(database);

  if (!Number.isInteger(input.totalCents) || input.totalCents <= 0) {
    throw new Error('O valor total da despesa deve ser positivo.');
  }

  const category = database.sqlite
    .prepare('SELECT id FROM expense_categories WHERE id = ? AND event_id = ?')
    .get(input.categoryId, eventId);

  if (category === undefined) {
    throw new Error('A categoria não pertence ao evento ativo.');
  }

  const expenseId = randomUUID();
  const now = Date.now();
  const description = input.description.trim();
  database.sqlite.transaction(() => {
    database.sqlite
      .prepare(
        `INSERT INTO expenses
         (id, event_id, category_id, description, total_cents, due_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        expenseId,
        eventId,
        input.categoryId,
        description,
        input.totalCents,
        input.dueAt ?? null,
        now,
      );
    appendAudit(database, {
      action: 'expense.created',
      entityType: 'expense',
      entityId: expenseId,
      eventId,
      details: {
        categoryId: input.categoryId,
        description,
        dueAt: input.dueAt ?? null,
        totalCents: input.totalCents,
      },
    });
  })();
  return getExpense(database, expenseId);
}

export function payExpense(
  database: DatabaseContext,
  input: {
    readonly expenseId: string;
    readonly method: DatabaseCashMethod;
    readonly amountCents: number;
    readonly note?: string;
  },
): DatabaseExpense {
  requireProduction(database);
  const eventId = requireActiveEventId(database);
  const session = requireOpenCashSession(database, eventId);
  const expense = getExpense(database, input.expenseId);

  if (expense.eventId !== eventId) {
    throw new Error('A despesa não pertence ao evento ativo.');
  }

  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error('O pagamento deve ter valor positivo.');
  }

  if (input.amountCents > expense.outstandingCents) {
    throw new Error('O pagamento não pode superar o saldo em aberto.');
  }

  const paymentId = randomUUID();
  const paidAt = Date.now();
  const note = input.note?.trim() || null;
  database.sqlite.transaction(() => {
    database.sqlite
      .prepare(
        `INSERT INTO expense_payments
         (id, expense_id, session_id, method, amount_cents, note, paid_at, reversed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(paymentId, expense.id, session.id, input.method, input.amountCents, note, paidAt);
    recordCashMovement(database, {
      sessionId: session.id,
      eventId,
      type: 'expense',
      method: input.method,
      amountCents: input.amountCents,
      note,
      sourceId: paymentId,
      createdAt: paidAt,
    });
    appendAudit(database, {
      action: 'expense.paid',
      entityType: 'expense-payment',
      entityId: paymentId,
      eventId,
      details: {
        amountCents: input.amountCents,
        expenseId: expense.id,
        method: input.method,
        note,
      },
    });
  })();
  return getExpense(database, expense.id);
}

export function reverseExpensePayment(
  database: DatabaseContext,
  paymentId: string,
): DatabaseExpense {
  requireProduction(database);
  const eventId = requireActiveEventId(database);
  const session = requireOpenCashSession(database, eventId);
  const row = database.sqlite
    .prepare(
      `SELECT ep.id, ep.expense_id, ep.method, ep.amount_cents, ep.note,
              ep.paid_at, ep.reversed_at, e.event_id
       FROM expense_payments ep
       INNER JOIN expenses e ON e.id = ep.expense_id
       WHERE ep.id = ?`,
    )
    .get(paymentId) as (PaymentRow & { readonly event_id: string }) | undefined;

  if (row === undefined) {
    throw new Error('O pagamento informado não existe.');
  }

  if (row.event_id !== eventId) {
    throw new Error('O pagamento não pertence ao evento ativo.');
  }

  if (row.reversed_at !== null) {
    throw new Error('Este pagamento já foi estornado.');
  }

  const reversedAt = Date.now();
  database.sqlite.transaction(() => {
    database.sqlite
      .prepare('UPDATE expense_payments SET reversed_at = ? WHERE id = ?')
      .run(reversedAt, row.id);
    recordCashMovement(database, {
      sessionId: session.id,
      eventId,
      type: 'expense-reversal',
      method: row.method,
      amountCents: row.amount_cents,
      note: row.note,
      sourceId: row.id,
      createdAt: reversedAt,
    });
    appendAudit(database, {
      action: 'expense.payment-reversed',
      entityType: 'expense-payment',
      entityId: row.id,
      eventId,
      details: { amountCents: row.amount_cents, expenseId: row.expense_id, method: row.method },
    });
  })();
  return getExpense(database, row.expense_id);
}
