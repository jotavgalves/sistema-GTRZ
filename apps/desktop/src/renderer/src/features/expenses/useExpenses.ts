import { useCallback, useEffect, useState } from 'react';

import type {
  CreateExpenseCategoryInput,
  CreateExpenseInput,
  ExpenseState,
  PayExpenseInput,
  ReverseExpensePaymentInput,
} from '@gtrz/contracts';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu uma falha inesperada.';
}

export function useExpenses(): {
  readonly state: ExpenseState | null;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly message: string | null;
  readonly reload: () => Promise<void>;
  readonly createCategory: (input: CreateExpenseCategoryInput) => Promise<void>;
  readonly createExpense: (input: CreateExpenseInput) => Promise<void>;
  readonly pay: (input: PayExpenseInput) => Promise<void>;
  readonly reversePayment: (input: ReverseExpensePaymentInput) => Promise<void>;
} {
  const [state, setState] = useState<ExpenseState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      setState(await window.gtrz.expenses.getState());
    } catch (loadError: unknown) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function execute(operation: () => Promise<unknown>, successMessage: string): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      await operation();
      setState(await window.gtrz.expenses.getState());
      setMessage(successMessage);
    } catch (operationError: unknown) {
      setError(getErrorMessage(operationError));
      throw operationError;
    } finally {
      setBusy(false);
    }
  }

  return {
    state,
    loading,
    busy,
    error,
    message,
    reload,
    createCategory: async (input) => {
      await execute(() => window.gtrz.expenses.createCategory(input), 'Categoria criada.');
    },
    createExpense: async (input) => {
      await execute(() => window.gtrz.expenses.create(input), 'Despesa registrada.');
    },
    pay: async (input) => {
      await execute(() => window.gtrz.expenses.pay(input), 'Pagamento registrado.');
    },
    reversePayment: async (input) => {
      await execute(() => window.gtrz.expenses.reversePayment(input), 'Pagamento estornado.');
    },
  };
}
