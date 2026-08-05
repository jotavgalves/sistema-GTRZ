import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  cancelSale,
  checkoutSale,
  createEvent,
  createInventoryCombo,
  createInventoryProduct,
  createProductCategory,
  createSaleTable,
  createVoucher,
  getCashSummary,
  getInventoryState,
  getOperationState,
  getVoucherState,
  openCashSession,
  openDatabase,
  recordStockMovement,
  type DatabaseContext,
} from './index';

let temporaryDirectory: string | null = null;

async function createTemporaryDatabase(): Promise<DatabaseContext> {
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'gtrz-operations-'));
  return openDatabase(path.join(temporaryDirectory, 'operations.sqlite'));
}

afterEach(async () => {
  if (temporaryDirectory !== null) {
    await rm(temporaryDirectory, { force: true, recursive: true });
    temporaryDirectory = null;
  }
});

function createProduct(database: DatabaseContext): string {
  const category = createProductCategory(database, 'Bebidas');
  const product = createInventoryProduct(database, {
    categoryId: category.id,
    name: 'Água mineral',
    kind: 'drink',
    costCents: 200,
    salePriceCents: 500,
    lowStockThreshold: 2,
  });
  recordStockMovement(database, { productId: product.id, type: 'purchase', quantity: 10 });
  return product.id;
}

describe('event operations database', () => {
  it('paga venda sem reservar estoque e mantém a mesa aberta', async () => {
    const database = await createTemporaryDatabase();
    createEvent(database, { name: 'Evento Operação', startsAt: Date.now() });
    const productId = createProduct(database);
    openCashSession(database, 1_000);
    const stateBefore = getOperationState(database);
    const counter = stateBefore.tables.find((table) => table.kind === 'counter');

    expect(counter).toBeDefined();
    expect(getInventoryState(database).products.find((item) => item.id === productId)?.quantity).toBe(
      10,
    );

    const sale = checkoutSale(database, {
      tableId: counter?.id ?? '',
      lines: [{ itemKind: 'product', itemId: productId, quantity: 2 }],
      payments: [{ method: 'cash', amountCents: 1_000 }],
      cashReceivedCents: 1_200,
    });

    expect(sale).toMatchObject({ totalCents: 1_000, changeCents: 200, status: 'paid' });
    expect(getInventoryState(database).products.find((item) => item.id === productId)?.quantity).toBe(
      8,
    );
    expect(getOperationState(database).tables.find((table) => table.id === counter?.id)?.status).toBe(
      'open',
    );
    expect(getCashSummary(database)).toMatchObject({
      commercialRevenueCents: 1_000,
      actualInflowCents: 1_000,
      cashSalesCents: 1_000,
      expectedCashCents: 2_000,
    });
    database.close();
  });

  it('baixa componentes do combo e aceita pagamento misto com um voucher', async () => {
    const database = await createTemporaryDatabase();
    createEvent(database, { name: 'Evento Combo', startsAt: Date.now() });
    const productId = createProduct(database);
    const combo = createInventoryCombo(database, {
      name: 'Duas águas',
      salePriceCents: 800,
      components: [{ productId, quantity: 2 }],
    });
    const voucher = createVoucher(database, {
      code: 'MISTO-001',
      origin: 'pre-sale',
      initialBalanceCents: 500,
    });
    openCashSession(database, 0);
    const table = createSaleTable(database, 'Mesa 01');
    const sale = checkoutSale(database, {
      tableId: table.id,
      lines: [{ itemKind: 'combo', itemId: combo.id, quantity: 1 }],
      payments: [
        { method: 'voucher', amountCents: 500, voucherCode: voucher.code },
        { method: 'pix', amountCents: 300 },
      ],
    });

    expect(sale.payments).toHaveLength(2);
    expect(getInventoryState(database).products.find((item) => item.id === productId)?.quantity).toBe(
      8,
    );
    expect(getVoucherState(database).vouchers[0]).toMatchObject({
      balanceCents: 0,
      status: 'depleted',
    });
    expect(getCashSummary(database)).toMatchObject({
      commercialRevenueCents: 800,
      actualInflowCents: 300,
      pixSalesCents: 300,
      voucherRedemptionCents: 500,
    });
    database.close();
  });

  it('cancela atomicamente, restaura estoque, voucher e fluxo financeiro', async () => {
    const database = await createTemporaryDatabase();
    createEvent(database, { name: 'Evento Cancelamento', startsAt: Date.now() });
    const productId = createProduct(database);
    const voucher = createVoucher(database, {
      code: 'ESTORNO-001',
      origin: 'pre-sale',
      initialBalanceCents: 500,
    });
    openCashSession(database, 0);
    const table = createSaleTable(database, 'Mesa 02');
    const sale = checkoutSale(database, {
      tableId: table.id,
      lines: [{ itemKind: 'product', itemId: productId, quantity: 2 }],
      payments: [
        { method: 'voucher', amountCents: 500, voucherCode: voucher.code },
        { method: 'card', amountCents: 500 },
      ],
    });
    const cancelled = cancelSale(database, { saleId: sale.id, reason: 'Venda duplicada' });

    expect(cancelled.status).toBe('cancelled');
    expect(getInventoryState(database).products.find((item) => item.id === productId)?.quantity).toBe(
      10,
    );
    expect(getVoucherState(database).vouchers[0]).toMatchObject({
      balanceCents: 500,
      status: 'active',
    });
    expect(getCashSummary(database)).toMatchObject({
      commercialRevenueCents: 0,
      actualInflowCents: 0,
      refundsCents: 500,
    });
    database.close();
  });

  it('rejeita venda sem saldo e preserva venda, caixa e estoque', async () => {
    const database = await createTemporaryDatabase();
    createEvent(database, { name: 'Evento Rollback', startsAt: Date.now() });
    const productId = createProduct(database);
    openCashSession(database, 0);
    const table = createSaleTable(database, 'Mesa 03');

    expect(() =>
      checkoutSale(database, {
        tableId: table.id,
        lines: [{ itemKind: 'product', itemId: productId, quantity: 11 }],
        payments: [{ method: 'pix', amountCents: 5_500 }],
      }),
    ).toThrow('Estoque insuficiente para Água mineral. Saldo atual: 10.');
    expect(getOperationState(database).recentSales).toHaveLength(0);
    expect(getInventoryState(database).products.find((item) => item.id === productId)?.quantity).toBe(
      10,
    );
    expect(getCashSummary(database).actualInflowCents).toBe(0);
    database.close();
  });
});
