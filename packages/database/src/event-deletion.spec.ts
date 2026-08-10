import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createEvent,
  createExpense,
  createInventoryProduct,
  createProductCategory,
  createServicePoint,
  deleteEventPermanently,
  getSessionState,
  listEvents,
  openDatabase,
  openOrder,
  recordStockMovement,
  verifyDatabaseIntegrity,
  type DatabaseContext,
} from './index';

let temporaryDirectory: string | null = null;

async function createTemporaryDatabase(): Promise<DatabaseContext> {
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'gtrz-event-delete-'));
  return openDatabase(path.join(temporaryDirectory, 'event-delete.sqlite'));
}

afterEach(async () => {
  if (temporaryDirectory !== null) {
    await rm(temporaryDirectory, { force: true, recursive: true });
    temporaryDirectory = null;
  }
});

describe('permanent event deletion', () => {
  it('remove evento ativo mesmo com comanda aberta, despesa e estoque', async () => {
    const database = await createTemporaryDatabase();
    const event = createEvent(database, { name: 'Evento descartável', startsAt: Date.now() });
    const category = createProductCategory(database, 'Exclusão');
    const product = createInventoryProduct(database, {
      categoryId: category.id,
      name: 'Produto descartável',
      kind: 'drink',
      costCents: 300,
      salePriceCents: 900,
      lowStockThreshold: 1,
    });
    recordStockMovement(database, { productId: product.id, type: 'purchase', quantity: 8 });
    createExpense(database, {
      category: 'Equipe',
      description: 'Despesa do evento descartável',
      amountCents: 1500,
      paymentMethod: 'pix',
    });
    const table = createServicePoint(database, { label: 'Mesa exclusão', type: 'table' });
    openOrder(database, table.id);

    const result = deleteEventPermanently(database, {
      eventId: event.id,
      confirmationName: event.name,
      reason: 'Evento criado apenas para teste',
    });

    expect(result).toMatchObject({
      eventId: event.id,
      deleted: true,
      removedOpenOrdersCount: 1,
      removedOrdersCount: 1,
      removedExpensesCount: 1,
      removedStockMovementsCount: 1,
    });
    expect(listEvents(database)).toHaveLength(0);
    expect(getSessionState(database).activeEvent).toBeNull();
    expect(
      database.sqlite.prepare('SELECT COUNT(*) AS amount FROM events WHERE id = ?').get(event.id),
    ).toEqual({ amount: 0 });
    expect(
      database.sqlite.prepare('SELECT COUNT(*) AS amount FROM orders WHERE event_id = ?').get(event.id),
    ).toEqual({ amount: 0 });
    expect(
      database.sqlite.prepare('SELECT COUNT(*) AS amount FROM expenses WHERE event_id = ?').get(event.id),
    ).toEqual({ amount: 0 });
    expect(
      database.sqlite
        .prepare('SELECT COUNT(*) AS amount FROM stock_movements WHERE event_id = ?')
        .get(event.id),
    ).toEqual({ amount: 0 });
    expect(verifyDatabaseIntegrity(database)).toBe(true);

    const audit = database.sqlite
      .prepare(
        `SELECT event_id, action, entity_id
         FROM audit_log
         WHERE action = 'event.deleted-permanently' AND entity_id = ?`,
      )
      .get(event.id) as
      | { readonly event_id: string | null; readonly action: string; readonly entity_id: string }
      | undefined;
    expect(audit).toEqual({
      event_id: null,
      action: 'event.deleted-permanently',
      entity_id: event.id,
    });
    database.close();
  });

  it('exige nome exato antes de iniciar qualquer exclusão', async () => {
    const database = await createTemporaryDatabase();
    const event = createEvent(database, { name: 'Evento protegido', startsAt: Date.now() });

    expect(() =>
      deleteEventPermanently(database, {
        eventId: event.id,
        confirmationName: 'Evento errado',
        reason: 'Teste de proteção',
      }),
    ).toThrow('Digite exatamente o nome do evento para confirmar a exclusão.');
    expect(listEvents(database)).toHaveLength(1);
    expect(verifyDatabaseIntegrity(database)).toBe(true);
    database.close();
  });
});
