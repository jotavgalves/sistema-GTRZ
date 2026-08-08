import { ipcRenderer } from 'electron';
import {
  cancelExpenseInputSchema,
  cashStateSchema,
  closeCashRegisterInputSchema,
  createExpenseInputSchema,
  deleteExpenseInputSchema,
  EXPENSE_DELETE_CHANNEL,
  expenseDeletionResultSchema,
  expenseSchema,
  expenseStateSchema,
  IPC_CHANNELS,
  openCashRegisterInputSchema,
  recordCashMovementInputSchema,
  type CancelExpenseInput,
  type CashApi,
  type CloseCashRegisterInput,
  type CreateExpenseInput,
  type DeleteExpenseInput,
  type Expense,
  type ExpenseApi,
  type ExpenseDeletionResult,
  type ExpenseState,
  type OpenCashRegisterInput,
  type RecordCashMovementInput,
} from '@gtrz/contracts';
export const cashApi: CashApi = {
  async getState() {
    return cashStateSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.cashGetState));
  },
  async open(input: OpenCashRegisterInput) {
    return cashStateSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.cashOpen, openCashRegisterInputSchema.parse(input)),
    );
  },
  async recordMovement(input: RecordCashMovementInput) {
    return cashStateSchema.parse(
      await ipcRenderer.invoke(
        IPC_CHANNELS.cashRecordMovement,
        recordCashMovementInputSchema.parse(input),
      ),
    );
  },
  async close(input: CloseCashRegisterInput) {
    return cashStateSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.cashClose, closeCashRegisterInputSchema.parse(input)),
    );
  },
};
export const expenseApi: ExpenseApi = {
  async getState(): Promise<ExpenseState> {
    return expenseStateSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.expensesGetState));
  },
  async create(input: CreateExpenseInput): Promise<Expense> {
    return expenseSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.expensesCreate, createExpenseInputSchema.parse(input)),
    );
  },
  async cancel(input: CancelExpenseInput): Promise<Expense> {
    return expenseSchema.parse(
      await ipcRenderer.invoke(IPC_CHANNELS.expensesCancel, cancelExpenseInputSchema.parse(input)),
    );
  },
  async delete(input: DeleteExpenseInput): Promise<ExpenseDeletionResult> {
    return expenseDeletionResultSchema.parse(
      await ipcRenderer.invoke(EXPENSE_DELETE_CHANNEL, deleteExpenseInputSchema.parse(input)),
    );
  },
};
