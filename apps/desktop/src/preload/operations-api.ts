import { ipcRenderer } from 'electron';

import {
  addCashMovementInputSchema,
  cancelSaleInputSchema,
  cashSummarySchema,
  changeSaleTableStatusInputSchema,
  changeVoucherStatusInputSchema,
  checkoutInputSchema,
  closeCashSessionInputSchema,
  createExpenseCategoryInputSchema,
  createExpenseInputSchema,
  createSaleTableInputSchema,
  createVoucherInputSchema,
  expenseCategorySchema,
  expenseSchema,
  expenseStateSchema,
  IPC_CHANNELS,
  openCashSessionInputSchema,
  operationStateSchema,
  payExpenseInputSchema,
  reverseExpensePaymentInputSchema,
  saleSchema,
  saleTableSchema,
  voucherSchema,
  voucherStateSchema,
  type AddCashMovementInput,
  type CashApi,
  type CashSummary,
  type CancelSaleInput,
  type ChangeSaleTableStatusInput,
  type ChangeVoucherStatusInput,
  type CheckoutInput,
  type CloseCashSessionInput,
  type CreateExpenseCategoryInput,
  type CreateExpenseInput,
  type CreateSaleTableInput,
  type CreateVoucherInput,
  type Expense,
  type ExpenseCategory,
  type ExpensesApi,
  type ExpenseState,
  type OpenCashSessionInput,
  type OperationState,
  type OperationsApi,
  type PayExpenseInput,
  type ReverseExpensePaymentInput,
  type Sale,
  type SaleTable,
  type Voucher,
  type VouchersApi,
  type VoucherState,
} from '@gtrz/contracts';

export const operationsApi: OperationsApi = {
  async getState(): Promise<OperationState> {
    const payload: unknown = await ipcRenderer.invoke(IPC_CHANNELS.operationsGetState);
    return operationStateSchema.parse(payload);
  },
  async createTable(input: CreateSaleTableInput): Promise<SaleTable> {
    const parsedInput = createSaleTableInputSchema.parse(input);
    const payload: unknown = await ipcRenderer.invoke(
      IPC_CHANNELS.operationsCreateTable,
      parsedInput,
    );
    return saleTableSchema.parse(payload);
  },
  async changeTableStatus(input: ChangeSaleTableStatusInput): Promise<SaleTable> {
    const parsedInput = changeSaleTableStatusInputSchema.parse(input);
    const payload: unknown = await ipcRenderer.invoke(
      IPC_CHANNELS.operationsChangeTableStatus,
      parsedInput,
    );
    return saleTableSchema.parse(payload);
  },
  async checkout(input: CheckoutInput): Promise<Sale> {
    const parsedInput = checkoutInputSchema.parse(input);
    const payload: unknown = await ipcRenderer.invoke(
      IPC_CHANNELS.operationsCheckout,
      parsedInput,
    );
    return saleSchema.parse(payload);
  },
  async cancelSale(input: CancelSaleInput): Promise<Sale> {
    const parsedInput = cancelSaleInputSchema.parse(input);
    const payload: unknown = await ipcRenderer.invoke(
      IPC_CHANNELS.operationsCancelSale,
      parsedInput,
    );
    return saleSchema.parse(payload);
  },
};

export const vouchersApi: VouchersApi = {
  async getState(): Promise<VoucherState> {
    const payload: unknown = await ipcRenderer.invoke(IPC_CHANNELS.vouchersGetState);
    return voucherStateSchema.parse(payload);
  },
  async create(input: CreateVoucherInput): Promise<Voucher> {
    const parsedInput = createVoucherInputSchema.parse(input);
    const payload: unknown = await ipcRenderer.invoke(IPC_CHANNELS.vouchersCreate, parsedInput);
    return voucherSchema.parse(payload);
  },
  async changeStatus(input: ChangeVoucherStatusInput): Promise<Voucher> {
    const parsedInput = changeVoucherStatusInputSchema.parse(input);
    const payload: unknown = await ipcRenderer.invoke(
      IPC_CHANNELS.vouchersChangeStatus,
      parsedInput,
    );
    return voucherSchema.parse(payload);
  },
};

export const cashApi: CashApi = {
  async getSummary(): Promise<CashSummary> {
    const payload: unknown = await ipcRenderer.invoke(IPC_CHANNELS.cashGetSummary);
    return cashSummarySchema.parse(payload);
  },
  async open(input: OpenCashSessionInput): Promise<CashSummary> {
    const parsedInput = openCashSessionInputSchema.parse(input);
    const payload: unknown = await ipcRenderer.invoke(IPC_CHANNELS.cashOpen, parsedInput);
    return cashSummarySchema.parse(payload);
  },
  async close(input: CloseCashSessionInput): Promise<CashSummary> {
    const parsedInput = closeCashSessionInputSchema.parse(input);
    const payload: unknown = await ipcRenderer.invoke(IPC_CHANNELS.cashClose, parsedInput);
    return cashSummarySchema.parse(payload);
  },
  async addMovement(input: AddCashMovementInput): Promise<CashSummary> {
    const parsedInput = addCashMovementInputSchema.parse(input);
    const payload: unknown = await ipcRenderer.invoke(
      IPC_CHANNELS.cashAddMovement,
      parsedInput,
    );
    return cashSummarySchema.parse(payload);
  },
};

export const expensesApi: ExpensesApi = {
  async getState(): Promise<ExpenseState> {
    const payload: unknown = await ipcRenderer.invoke(IPC_CHANNELS.expensesGetState);
    return expenseStateSchema.parse(payload);
  },
  async createCategory(input: CreateExpenseCategoryInput): Promise<ExpenseCategory> {
    const parsedInput = createExpenseCategoryInputSchema.parse(input);
    const payload: unknown = await ipcRenderer.invoke(
      IPC_CHANNELS.expensesCreateCategory,
      parsedInput,
    );
    return expenseCategorySchema.parse(payload);
  },
  async create(input: CreateExpenseInput): Promise<Expense> {
    const parsedInput = createExpenseInputSchema.parse(input);
    const payload: unknown = await ipcRenderer.invoke(IPC_CHANNELS.expensesCreate, parsedInput);
    return expenseSchema.parse(payload);
  },
  async pay(input: PayExpenseInput): Promise<Expense> {
    const parsedInput = payExpenseInputSchema.parse(input);
    const payload: unknown = await ipcRenderer.invoke(IPC_CHANNELS.expensesPay, parsedInput);
    return expenseSchema.parse(payload);
  },
  async reversePayment(input: ReverseExpensePaymentInput): Promise<Expense> {
    const parsedInput = reverseExpensePaymentInputSchema.parse(input);
    const payload: unknown = await ipcRenderer.invoke(
      IPC_CHANNELS.expensesReversePayment,
      parsedInput,
    );
    return expenseSchema.parse(payload);
  },
};
