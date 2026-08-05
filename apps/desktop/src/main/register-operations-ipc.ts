import { ipcMain } from 'electron';

import {
  addCashMovementInputSchema,
  cancelSaleInputSchema,
  cashSummarySchema,
  changeSaleTableStatusInputSchema,
  changeVoucherStatusInputSchema,
  checkoutInputSchema,
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
  closeCashSessionInputSchema,
} from '@gtrz/contracts';
import {
  addManualCashMovement,
  cancelSale,
  changeSaleTableStatus,
  changeVoucherStatus,
  checkoutSale,
  closeCashSession,
  createExpense,
  createExpenseCategory,
  createSaleTable,
  createVoucher,
  getCashSummary,
  getExpenseState,
  getOperationState,
  getVoucherState,
  openCashSession,
  payExpense,
  reverseExpensePayment,
  type DatabaseContext,
} from '@gtrz/database';

interface RegisterOperationsIpcOptions {
  readonly getDatabase: () => DatabaseContext;
}

const OPERATION_CHANNELS = [
  IPC_CHANNELS.operationsGetState,
  IPC_CHANNELS.operationsCreateTable,
  IPC_CHANNELS.operationsChangeTableStatus,
  IPC_CHANNELS.operationsCheckout,
  IPC_CHANNELS.operationsCancelSale,
  IPC_CHANNELS.vouchersGetState,
  IPC_CHANNELS.vouchersCreate,
  IPC_CHANNELS.vouchersChangeStatus,
  IPC_CHANNELS.cashGetSummary,
  IPC_CHANNELS.cashOpen,
  IPC_CHANNELS.cashClose,
  IPC_CHANNELS.cashAddMovement,
  IPC_CHANNELS.expensesGetState,
  IPC_CHANNELS.expensesCreateCategory,
  IPC_CHANNELS.expensesCreate,
  IPC_CHANNELS.expensesPay,
  IPC_CHANNELS.expensesReversePayment,
] as const;

export function registerOperationsIpcHandlers(options: RegisterOperationsIpcOptions): void {
  for (const channel of OPERATION_CHANNELS) {
    ipcMain.removeHandler(channel);
  }

  ipcMain.handle(IPC_CHANNELS.operationsGetState, () => {
    return operationStateSchema.parse(getOperationState(options.getDatabase()));
  });

  ipcMain.handle(IPC_CHANNELS.operationsCreateTable, (_event, payload: unknown) => {
    const input = createSaleTableInputSchema.parse(payload);
    return saleTableSchema.parse(createSaleTable(options.getDatabase(), input.name));
  });

  ipcMain.handle(IPC_CHANNELS.operationsChangeTableStatus, (_event, payload: unknown) => {
    const input = changeSaleTableStatusInputSchema.parse(payload);
    return saleTableSchema.parse(changeSaleTableStatus(options.getDatabase(), input));
  });

  ipcMain.handle(IPC_CHANNELS.operationsCheckout, (_event, payload: unknown) => {
    const input = checkoutInputSchema.parse(payload);
    return saleSchema.parse(checkoutSale(options.getDatabase(), input));
  });

  ipcMain.handle(IPC_CHANNELS.operationsCancelSale, (_event, payload: unknown) => {
    const input = cancelSaleInputSchema.parse(payload);
    return saleSchema.parse(cancelSale(options.getDatabase(), input));
  });

  ipcMain.handle(IPC_CHANNELS.vouchersGetState, () => {
    return voucherStateSchema.parse(getVoucherState(options.getDatabase()));
  });

  ipcMain.handle(IPC_CHANNELS.vouchersCreate, (_event, payload: unknown) => {
    const input = createVoucherInputSchema.parse(payload);
    return voucherSchema.parse(createVoucher(options.getDatabase(), input));
  });

  ipcMain.handle(IPC_CHANNELS.vouchersChangeStatus, (_event, payload: unknown) => {
    const input = changeVoucherStatusInputSchema.parse(payload);
    return voucherSchema.parse(changeVoucherStatus(options.getDatabase(), input));
  });

  ipcMain.handle(IPC_CHANNELS.cashGetSummary, () => {
    return cashSummarySchema.parse(getCashSummary(options.getDatabase()));
  });

  ipcMain.handle(IPC_CHANNELS.cashOpen, (_event, payload: unknown) => {
    const input = openCashSessionInputSchema.parse(payload);
    return cashSummarySchema.parse(
      openCashSession(options.getDatabase(), input.openingFloatCents),
    );
  });

  ipcMain.handle(IPC_CHANNELS.cashClose, (_event, payload: unknown) => {
    const input = closeCashSessionInputSchema.parse(payload);
    return cashSummarySchema.parse(
      closeCashSession(options.getDatabase(), input.countedClosingCents),
    );
  });

  ipcMain.handle(IPC_CHANNELS.cashAddMovement, (_event, payload: unknown) => {
    const input = addCashMovementInputSchema.parse(payload);
    return cashSummarySchema.parse(addManualCashMovement(options.getDatabase(), input));
  });

  ipcMain.handle(IPC_CHANNELS.expensesGetState, () => {
    return expenseStateSchema.parse(getExpenseState(options.getDatabase()));
  });

  ipcMain.handle(IPC_CHANNELS.expensesCreateCategory, (_event, payload: unknown) => {
    const input = createExpenseCategoryInputSchema.parse(payload);
    return expenseCategorySchema.parse(createExpenseCategory(options.getDatabase(), input.name));
  });

  ipcMain.handle(IPC_CHANNELS.expensesCreate, (_event, payload: unknown) => {
    const input = createExpenseInputSchema.parse(payload);
    return expenseSchema.parse(createExpense(options.getDatabase(), input));
  });

  ipcMain.handle(IPC_CHANNELS.expensesPay, (_event, payload: unknown) => {
    const input = payExpenseInputSchema.parse(payload);
    return expenseSchema.parse(payExpense(options.getDatabase(), input));
  });

  ipcMain.handle(IPC_CHANNELS.expensesReversePayment, (_event, payload: unknown) => {
    const input = reverseExpensePaymentInputSchema.parse(payload);
    return expenseSchema.parse(reverseExpensePayment(options.getDatabase(), input.paymentId));
  });
}
