import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createEvent,
  createExpense,
  createExpenseCategory,
  getCashSummary,
  getExpenseState,
  openCashSession,
  openDatabase,
  payExpense,
  reverseExpensePayment,
  switchProfile,
  type DatabaseContext,
} from './index';

let temporaryDirectory: string | null = null;

async function createTemporaryDatabase(): Promise<DatabaseContext> {
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'gtrz-expenses-'));
  return openDatabase(path.join(temporaryDirectory, 'expenses.sqlite'));
}

afterEach(async () => {
  if (temporaryDirectory !== null) {
    await rm(temporaryDirectory, { force: true, recursive: true });
    temporaryDirectory = null;
  }
});

describe('expenses database', () => {
  it('mantém despesa aberta, parcial e paga conforme parcelas válidas', async () => {
    const database = await createTemporaryDatabase();
    createEvent(database, { name: 'Evento Despesas', startsAt: Date.now() });
    openCashSession(database, 1_000);
    const category = createExpenseCategory(database, 'Estrutura');
    const expense = createExpense(database, {
      categoryId: category.id,
      description: 'Locação de grades',
      totalCents: 1_500,
    });

    expect(expense).toMatchObject({ status: 'open', paidCents: 0, outstandingCents: 1_500 });
    const partial = payExpense(database, {
      expenseId: expense.id,
      method: 'cash',
      amountCents: 500,
      note: 'Entrada',
    });
    expect(partial).toMatchObject({ status: 'partial', paidCents: 500, outstandingCents: 1_000 });
    const paid = payExpense(database, {
      expenseId: expense.id,
      method: 'pix',
      amountCents: 1_000,
    });
    expect(paid).toMatchObject({ status: 'paid', paidCents: 1_500, outstandingCents: 0 });
    expect(getCashSummary(database)).toMatchObject({
      expensesPaidCents: 1_500,
      expectedCashCents: 500,
    });
    database.close();
  });

  it('estorna parcela e recalcula saldo e caixa', async () => {
    const database = await createTemporaryDatabase();
    createEvent(database, { name: 'Evento Estorno Despesa', startsAt: Date.now() });
    openCashSession(database, 1_000);
    const category = createExpenseCategory(database, 'Equipe');
    const expense = createExpense(database, {
      categoryId: category.id,
      description: 'Diária de apoio',
      totalCents: 600,
    });
    const paid = payExpense(database, {
      expenseId: expense.id,
      method: 'cash',
      amountCents: 600,
    });
    const paymentId = paid.payments[0]?.id;

    expect(paymentId).toBeDefined();
    const reversed = reverseExpensePayment(database, paymentId ?? '');
    expect(reversed).toMatchObject({ status: 'open', paidCents: 0, outstandingCents: 600 });
    expect(getCashSummary(database)).toMatchObject({
      expensesPaidCents: 0,
      expectedCashCents: 1_000,
    });
    database.close();
  });

  it('bloqueia despesas no perfil Caixa', async () => {
    const database = await createTemporaryDatabase();
    createEvent(database, { name: 'Evento Caixa', startsAt: Date.now() });
    switchProfile(database, 'cashier');

    expect(() => createExpenseCategory(database, 'Bloqueada')).toThrow(
      'Esta operação de despesa exige o perfil Produção.',
    );
    expect(getExpenseState(database).expenses).toHaveLength(0);
    database.close();
  });
});
