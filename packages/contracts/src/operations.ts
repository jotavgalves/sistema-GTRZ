import { z } from 'zod';

export const saleItemKindSchema = z.enum(['product', 'combo']);
export const paymentMethodSchema = z.enum(['card', 'pix', 'cash', 'voucher']);
export const tableKindSchema = z.enum(['counter', 'table']);
export const tableStatusSchema = z.enum(['open', 'closed']);
export const saleStatusSchema = z.enum(['paid', 'cancelled']);

export const operationalCatalogItemSchema = z.object({
  id: z.uuid(),
  kind: saleItemKindSchema,
  name: z.string().min(1),
  categoryId: z.uuid().nullable(),
  categoryName: z.string().min(1).nullable(),
  salePriceCents: z.number().int().nonnegative(),
  availableUnits: z.number().int().nonnegative(),
  active: z.boolean(),
});

export const saleTableSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  kind: tableKindSchema,
  status: tableStatusSchema,
  openedAt: z.number().int().nonnegative(),
  closedAt: z.number().int().nonnegative().nullable(),
  totalPaidCents: z.number().int().nonnegative(),
  saleCount: z.number().int().nonnegative(),
});

export const saleLineSchema = z.object({
  id: z.uuid(),
  itemKind: saleItemKindSchema,
  itemId: z.uuid(),
  itemName: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  totalPriceCents: z.number().int().nonnegative(),
});

export const salePaymentSchema = z.object({
  id: z.uuid(),
  method: paymentMethodSchema,
  amountCents: z.number().int().positive(),
  voucherCode: z.string().min(1).nullable(),
});

export const saleSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  tableId: z.uuid(),
  tableName: z.string().min(1),
  status: saleStatusSchema,
  totalCents: z.number().int().nonnegative(),
  changeCents: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
  cancelledAt: z.number().int().nonnegative().nullable(),
  lines: z.array(saleLineSchema).min(1),
  payments: z.array(salePaymentSchema).min(1).max(2),
});

export const checkoutLineInputSchema = z.object({
  itemKind: saleItemKindSchema,
  itemId: z.uuid(),
  quantity: z.number().int().positive(),
});

export const paymentPartInputSchema = z
  .object({
    method: paymentMethodSchema,
    amountCents: z.number().int().positive(),
    voucherCode: z.string().trim().min(1).max(80).optional(),
  })
  .superRefine((input, context) => {
    if (input.method === 'voucher' && input.voucherCode === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Informe o código do voucher.',
        path: ['voucherCode'],
      });
    }

    if (input.method !== 'voucher' && input.voucherCode !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Código de voucher só pode ser usado no pagamento por voucher.',
        path: ['voucherCode'],
      });
    }
  });

export const checkoutInputSchema = z
  .object({
    tableId: z.uuid(),
    lines: z.array(checkoutLineInputSchema).min(1),
    payments: z.array(paymentPartInputSchema).min(1).max(2),
    cashReceivedCents: z.number().int().nonnegative().optional(),
  })
  .superRefine((input, context) => {
    const lineKeys = input.lines.map((line) => `${line.itemKind}:${line.itemId}`);
    if (new Set(lineKeys).size !== lineKeys.length) {
      context.addIssue({
        code: 'custom',
        message: 'O mesmo item não pode aparecer duas vezes no carrinho.',
        path: ['lines'],
      });
    }

    const voucherPayments = input.payments.filter((payment) => payment.method === 'voucher');
    if (voucherPayments.length > 1) {
      context.addIssue({
        code: 'custom',
        message: 'A venda aceita no máximo um voucher.',
        path: ['payments'],
      });
    }
  });

export const createSaleTableInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const changeSaleTableStatusInputSchema = z.object({
  tableId: z.uuid(),
  status: tableStatusSchema,
});

export const cancelSaleInputSchema = z.object({
  saleId: z.uuid(),
  reason: z.string().trim().min(3).max(240),
});

export const operationStateSchema = z.object({
  activeEventId: z.uuid().nullable(),
  tables: z.array(saleTableSchema),
  catalog: z.array(operationalCatalogItemSchema),
  recentSales: z.array(saleSchema),
});

export const voucherOriginSchema = z.enum(['pre-sale', 'local-sale', 'courtesy']);
export const voucherStatusSchema = z.enum(['active', 'depleted', 'cancelled']);

export const voucherSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  code: z.string().min(1),
  origin: voucherOriginSchema,
  status: voucherStatusSchema,
  initialBalanceCents: z.number().int().positive(),
  balanceCents: z.number().int().nonnegative(),
  tableId: z.uuid().nullable(),
  tableName: z.string().nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export const voucherStateSchema = z.object({
  activeEventId: z.uuid().nullable(),
  vouchers: z.array(voucherSchema),
});

export const createVoucherInputSchema = z.object({
  code: z.string().trim().min(3).max(80).optional(),
  origin: voucherOriginSchema,
  initialBalanceCents: z.number().int().positive(),
  tableId: z.uuid().nullable().optional(),
});

export const changeVoucherStatusInputSchema = z.object({
  voucherId: z.uuid(),
  action: z.enum(['cancel', 'reactivate']),
});

export const cashSessionStatusSchema = z.enum(['open', 'closed']);
export const cashManualMovementTypeSchema = z.enum(['supply', 'withdrawal']);

export const cashSessionSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  status: cashSessionStatusSchema,
  openingFloatCents: z.number().int().nonnegative(),
  countedClosingCents: z.number().int().nonnegative().nullable(),
  openedAt: z.number().int().nonnegative(),
  closedAt: z.number().int().nonnegative().nullable(),
});

export const cashSummarySchema = z.object({
  session: cashSessionSchema.nullable(),
  commercialRevenueCents: z.number().int(),
  actualInflowCents: z.number().int(),
  cashSalesCents: z.number().int(),
  pixSalesCents: z.number().int(),
  cardSalesCents: z.number().int(),
  voucherRedemptionCents: z.number().int(),
  suppliesCents: z.number().int(),
  withdrawalsCents: z.number().int(),
  expensesPaidCents: z.number().int(),
  refundsCents: z.number().int(),
  expectedCashCents: z.number().int(),
});

export const openCashSessionInputSchema = z.object({
  openingFloatCents: z.number().int().nonnegative(),
});

export const closeCashSessionInputSchema = z.object({
  countedClosingCents: z.number().int().nonnegative(),
});

export const addCashMovementInputSchema = z.object({
  type: cashManualMovementTypeSchema,
  amountCents: z.number().int().positive(),
  note: z.string().trim().min(2).max(240),
});

export const expenseStatusSchema = z.enum(['open', 'partial', 'paid']);
export const expensePaymentMethodSchema = z.enum(['card', 'pix', 'cash']);

export const expenseCategorySchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  name: z.string().trim().min(2).max(80),
});

export const expensePaymentSchema = z.object({
  id: z.uuid(),
  method: expensePaymentMethodSchema,
  amountCents: z.number().int().positive(),
  note: z.string().nullable(),
  paidAt: z.number().int().nonnegative(),
  reversedAt: z.number().int().nonnegative().nullable(),
});

export const expenseSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  categoryId: z.uuid(),
  categoryName: z.string().min(1),
  description: z.string().trim().min(2).max(160),
  totalCents: z.number().int().positive(),
  paidCents: z.number().int().nonnegative(),
  outstandingCents: z.number().int().nonnegative(),
  status: expenseStatusSchema,
  dueAt: z.number().int().nonnegative().nullable(),
  createdAt: z.number().int().nonnegative(),
  payments: z.array(expensePaymentSchema),
});

export const expenseStateSchema = z.object({
  activeEventId: z.uuid().nullable(),
  categories: z.array(expenseCategorySchema),
  expenses: z.array(expenseSchema),
});

export const createExpenseCategoryInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export const createExpenseInputSchema = z.object({
  categoryId: z.uuid(),
  description: z.string().trim().min(2).max(160),
  totalCents: z.number().int().positive(),
  dueAt: z.number().int().nonnegative().nullable().optional(),
});

export const payExpenseInputSchema = z.object({
  expenseId: z.uuid(),
  method: expensePaymentMethodSchema,
  amountCents: z.number().int().positive(),
  note: z.string().trim().max(240).optional(),
});

export const reverseExpensePaymentInputSchema = z.object({
  paymentId: z.uuid(),
});

export type SaleItemKind = z.infer<typeof saleItemKindSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type OperationalCatalogItem = z.infer<typeof operationalCatalogItemSchema>;
export type SaleTable = z.infer<typeof saleTableSchema>;
export type SaleLine = z.infer<typeof saleLineSchema>;
export type SalePayment = z.infer<typeof salePaymentSchema>;
export type Sale = z.infer<typeof saleSchema>;
export type CheckoutInput = z.infer<typeof checkoutInputSchema>;
export type CreateSaleTableInput = z.infer<typeof createSaleTableInputSchema>;
export type ChangeSaleTableStatusInput = z.infer<typeof changeSaleTableStatusInputSchema>;
export type CancelSaleInput = z.infer<typeof cancelSaleInputSchema>;
export type OperationState = z.infer<typeof operationStateSchema>;
export type Voucher = z.infer<typeof voucherSchema>;
export type VoucherState = z.infer<typeof voucherStateSchema>;
export type CreateVoucherInput = z.infer<typeof createVoucherInputSchema>;
export type ChangeVoucherStatusInput = z.infer<typeof changeVoucherStatusInputSchema>;
export type CashSummary = z.infer<typeof cashSummarySchema>;
export type OpenCashSessionInput = z.infer<typeof openCashSessionInputSchema>;
export type CloseCashSessionInput = z.infer<typeof closeCashSessionInputSchema>;
export type AddCashMovementInput = z.infer<typeof addCashMovementInputSchema>;
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;
export type Expense = z.infer<typeof expenseSchema>;
export type ExpenseState = z.infer<typeof expenseStateSchema>;
export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategoryInputSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseInputSchema>;
export type PayExpenseInput = z.infer<typeof payExpenseInputSchema>;
export type ReverseExpensePaymentInput = z.infer<typeof reverseExpensePaymentInputSchema>;

export interface OperationsApi {
  getState(): Promise<OperationState>;
  createTable(input: CreateSaleTableInput): Promise<SaleTable>;
  changeTableStatus(input: ChangeSaleTableStatusInput): Promise<SaleTable>;
  checkout(input: CheckoutInput): Promise<Sale>;
  cancelSale(input: CancelSaleInput): Promise<Sale>;
}

export interface VouchersApi {
  getState(): Promise<VoucherState>;
  create(input: CreateVoucherInput): Promise<Voucher>;
  changeStatus(input: ChangeVoucherStatusInput): Promise<Voucher>;
}

export interface CashApi {
  getSummary(): Promise<CashSummary>;
  open(input: OpenCashSessionInput): Promise<CashSummary>;
  close(input: CloseCashSessionInput): Promise<CashSummary>;
  addMovement(input: AddCashMovementInput): Promise<CashSummary>;
}

export interface ExpensesApi {
  getState(): Promise<ExpenseState>;
  createCategory(input: CreateExpenseCategoryInput): Promise<ExpenseCategory>;
  create(input: CreateExpenseInput): Promise<Expense>;
  pay(input: PayExpenseInput): Promise<Expense>;
  reversePayment(input: ReverseExpensePaymentInput): Promise<Expense>;
}
