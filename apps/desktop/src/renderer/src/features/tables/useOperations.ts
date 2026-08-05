import { useCallback, useEffect, useState } from 'react';

import type {
  CancelSaleInput,
  ChangeSaleTableStatusInput,
  CheckoutInput,
  CreateSaleTableInput,
  OperationState,
} from '@gtrz/contracts';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu uma falha inesperada.';
}

export function useOperations(): {
  readonly state: OperationState | null;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly message: string | null;
  readonly reload: () => Promise<void>;
  readonly createTable: (input: CreateSaleTableInput) => Promise<void>;
  readonly changeTableStatus: (input: ChangeSaleTableStatusInput) => Promise<void>;
  readonly checkout: (input: CheckoutInput) => Promise<void>;
  readonly cancelSale: (input: CancelSaleInput) => Promise<void>;
} {
  const [state, setState] = useState<OperationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      setState(await window.gtrz.operations.getState());
    } catch (loadError: unknown) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const execute = useCallback(
    async (operation: () => Promise<unknown>, successMessage: string): Promise<void> => {
      setBusy(true);
      setError(null);
      setMessage(null);

      try {
        await operation();
        setState(await window.gtrz.operations.getState());
        setMessage(successMessage);
      } catch (operationError: unknown) {
        setError(getErrorMessage(operationError));
        throw operationError;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return {
    state,
    loading,
    busy,
    error,
    message,
    reload,
    createTable: async (input) => {
      await execute(() => window.gtrz.operations.createTable(input), 'Mesa criada.');
    },
    changeTableStatus: async (input) => {
      await execute(
        () => window.gtrz.operations.changeTableStatus(input),
        input.status === 'closed' ? 'Mesa encerrada.' : 'Mesa reaberta.',
      );
    },
    checkout: async (input) => {
      await execute(() => window.gtrz.operations.checkout(input), 'Venda concluída.');
    },
    cancelSale: async (input) => {
      await execute(() => window.gtrz.operations.cancelSale(input), 'Venda cancelada e estornada.');
    },
  };
}
