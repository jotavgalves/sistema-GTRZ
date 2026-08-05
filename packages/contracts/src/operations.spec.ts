import { describe, expect, it } from 'vitest';

import {
  checkoutInputSchema,
  createExpenseInputSchema,
  createVoucherInputSchema,
  paymentPartInputSchema,
} from './operations';

const firstItemId = '85ffbb3f-6d4c-43d3-b615-e437fd5d88f4';
const secondItemId = '56a0f4e4-581b-4777-b1dd-7a58ed51274e';
const tableId = '908fed30-8249-4de7-b090-f4f7a257620d';
const categoryId = 'f1f94fc8-93b8-4656-a70a-375ba9604ff2';

describe('operation contracts', () => {
  it('aceita pagamento simples e misto com exatamente até duas parcelas', () => {
    expect(
      checkoutInputSchema.parse({
        tableId,
        lines: [{ itemKind: 'product', itemId: firstItemId, quantity: 2 }],
        payments: [{ method: 'pix', amountCents: 1_000 }],
      }),
    ).toMatchObject({ tableId });
    expect(
      checkoutInputSchema.parse({
        tableId,
        lines: [{ itemKind: 'combo', itemId: firstItemId, quantity: 1 }],
        payments: [
          { method: 'voucher', amountCents: 500, voucherCode: 'GTRZ-001' },
          { method: 'card', amountCents: 300 },
        ],
      }).payments,
    ).toHaveLength(2);
  });

  it('rejeita item repetido e mais de um voucher', () => {
    expect(() =>
      checkoutInputSchema.parse({
        tableId,
        lines: [
          { itemKind: 'product', itemId: firstItemId, quantity: 1 },
          { itemKind: 'product', itemId: firstItemId, quantity: 1 },
        ],
        payments: [{ method: 'cash', amountCents: 1_000 }],
      }),
    ).toThrow();
    expect(() =>
      checkoutInputSchema.parse({
        tableId,
        lines: [{ itemKind: 'product', itemId: secondItemId, quantity: 1 }],
        payments: [
          { method: 'voucher', amountCents: 500, voucherCode: 'A' },
          { method: 'voucher', amountCents: 500, voucherCode: 'B' },
        ],
      }),
    ).toThrow();
  });

  it('exige código somente no pagamento por voucher', () => {
    expect(() => paymentPartInputSchema.parse({ method: 'voucher', amountCents: 100 })).toThrow();
    expect(() =>
      paymentPartInputSchema.parse({ method: 'pix', amountCents: 100, voucherCode: 'INVÁLIDO' }),
    ).toThrow();
  });
});

describe('voucher and expense contracts', () => {
  it('aceita voucher monetário e despesa com vencimento opcional', () => {
    expect(
      createVoucherInputSchema.parse({
        origin: 'pre-sale',
        initialBalanceCents: 5_000,
      }),
    ).toMatchObject({ initialBalanceCents: 5_000 });
    expect(
      createExpenseInputSchema.parse({
        categoryId,
        description: 'Equipe de apoio',
        totalCents: 10_000,
      }),
    ).toMatchObject({ description: 'Equipe de apoio' });
  });
});
