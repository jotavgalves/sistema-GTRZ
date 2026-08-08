import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  addOrderItem,
  bindOrderVoucher,
  closeOrder,
  createEvent,
  createInventoryProduct,
  createProductCategory,
  createServicePoint,
  createVoucher,
  deleteVoucher,
  getOrder,
  getVoucherState,
  openDatabase,
  openOrder,
  previewVoucherDeletion,
  recordStockMovement,
  updateVoucher,
  type DatabaseContext,
} from './index';

let temporaryDirectory: string | null = null;

async function createTemporaryDatabase(): Promise<DatabaseContext> {
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'gtrz-voucher-management-'));
  return openDatabase(path.join(temporaryDirectory, 'voucher-management.sqlite'));
}

afterEach(async () => {
  if (temporaryDirectory !== null) {
    await rm(temporaryDirectory, { force: true, recursive: true });
    temporaryDirectory = null;
  }
});

function seedProduct(database: DatabaseContext): string {
  const category = createProductCategory(database, 'Gestão de voucher');
  const product = createInventoryProduct(database, {
    categoryId: category.id,
    name: 'Produto com voucher',
    kind: 'drink',
    costCents: 200,
    salePriceCents: 1000,
    lowStockThreshold: 1,
  });
  recordStockMovement(database, { productId: product.id, type: 'purchase', quantity: 5 });
  return product.id;
}

function getStock(database: DatabaseContext, eventId: string, productId: string): number {
  const row = database.sqlite
    .prepare('SELECT quantity FROM event_stock WHERE event_id = ? AND product_id = ?')
    .get(eventId, productId) as { readonly quantity: number } | undefined;
  return row?.quantity ?? 0;
}

describe('gestão avançada de vouchers', () => {
  it('trava a mesa original e só libera novo vínculo depois da exclusão dela', async () => {
    const database = await createTemporaryDatabase();
    createEvent(database, { name: 'Evento edição voucher', startsAt: Date.now() });
    const firstTable = createServicePoint(database, { label: 'Mesa 01', type: 'table' });
    const secondTable = createServicePoint(database, { label: 'Mesa 02', type: 'table' });
    const voucher = createVoucher(database, {
      code: 'MESA-01',
      label: 'Crédito inicial',
      initialBalanceCents: 1000,
      servicePointId: firstTable.id,
    });

    expect(voucher).toMatchObject({
      servicePointId: firstTable.id,
      servicePointLabel: 'Mesa 01',
    });
    expect(() =>
      updateVoucher(database, {
        voucherId: voucher.id,
        code: 'MESA-02',
        label: 'Crédito alterado',
        servicePointId: firstTable.id,
        addBalanceCents: -1,
      }),
    ).toThrow('O acréscimo do voucher não pode ser negativo.');
    expect(() =>
      updateVoucher(database, {
        voucherId: voucher.id,
        code: 'MESA-02',
        label: 'Crédito alterado',
        servicePointId: secondTable.id,
        addBalanceCents: 500,
      }),
    ).toThrow('O vínculo deste voucher só pode ser alterado depois que a mesa original for excluída.');

    const updated = updateVoucher(database, {
      voucherId: voucher.id,
      code: 'MESA-02',
      label: 'Crédito alterado',
      servicePointId: firstTable.id,
      addBalanceCents: 500,
    });
    expect(updated).toMatchObject({
      code: 'MESA-02',
      label: 'Crédito alterado',
      initialBalanceCents: 1500,
      remainingBalanceCents: 1500,
      servicePointId: firstTable.id,
      servicePointLabel: 'Mesa 01',
    });

    database.sqlite.prepare('UPDATE service_points SET active = 0 WHERE id = ?').run(firstTable.id);
    const relinked = updateVoucher(database, {
      voucherId: voucher.id,
      code: 'MESA-02',
      label: 'Crédito alterado',
      servicePointId: secondTable.id,
      addBalanceCents: 0,
    });
    expect(relinked).toMatchObject({
      servicePointId: secondTable.id,
      servicePointLabel: 'Mesa 02',
    });
    database.close();
  });

  it('impede código manual em outra mesa e exclui cancelando a venda da mesa correta', async () => {
    const database = await createTemporaryDatabase();
    const event = createEvent(database, { name: 'Evento exclusão voucher', startsAt: Date.now() });
    const productId = seedProduct(database);
    const linkedTable = createServicePoint(database, { label: 'Mesa vinculada', type: 'table' });
    const otherTable = createServicePoint(database, { label: 'Mesa errada', type: 'table' });
    const voucher = createVoucher(database, {
      code: 'EXCLUIR-01',
      label: 'Crédito a excluir',
      initialBalanceCents: 400,
      servicePointId: linkedTable.id,
    });

    const wrongOrder = openOrder(database, otherTable.id);
    addOrderItem(database, {
      orderId: wrongOrder.id,
      itemKind: 'product',
      itemId: productId,
      quantity: 1,
    });
    expect(() => bindOrderVoucher(database, { orderId: wrongOrder.id, code: voucher.code })).toThrow(
      'não pode ser usado em Mesa errada',
    );

    const order = openOrder(database, linkedTable.id);
    const orderWithItem = addOrderItem(database, {
      orderId: order.id,
      itemKind: 'product',
      itemId: productId,
      quantity: 1,
    });
    bindOrderVoucher(database, { orderId: order.id, code: voucher.code });
    closeOrder(database, {
      orderId: order.id,
      discountCents: 0,
      payments: [{ method: 'cash', amountCents: 600, receivedCents: 1000 }],
      voucherUses: [{ code: voucher.code, amountCents: 400 }],
    });

    expect(getStock(database, event.id, productId)).toBe(4);
    expect(previewVoucherDeletion(database, voucher.id)).toMatchObject({
      paidOrderCount: 1,
      paidOrderTotalCents: 1000,
      restoredUnits: 1,
      voucherRedemptionCents: 400,
    });

    const result = deleteVoucher(database, {
      voucherId: voucher.id,
      reason: 'Voucher emitido para a pessoa errada',
    });
    expect(result).toMatchObject({ paidOrderCount: 1, restoredUnits: 1 });
    expect(getOrder(database, orderWithItem.id).status).toBe('cancelled');
    expect(getStock(database, event.id, productId)).toBe(5);
    expect(getVoucherState(database).vouchers).toHaveLength(0);
    expect(
      database.sqlite.prepare('SELECT status, deleted_at FROM vouchers WHERE id = ?').get(voucher.id),
    ).toMatchObject({ status: 'cancelled' });
    database.close();
  });
});
