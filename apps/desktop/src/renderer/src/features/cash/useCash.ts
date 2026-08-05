import { useCallback, useEffect, useState } from 'react';

import type {
  AddCashMovementInput,
  CashSummary,
  CloseCashSessionInput,
  OpenCashSessionInput,
} from '@gtrz/contracts';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu uma falha inesperada.';
}

export function useCash(): {
  readonly summary: CashSummary | null;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly message: string | null;
  readonly reload: () => Promise<void>;
  readonly open: (input: OpenCashSessionInput) => Promise<void>;
  readonly close: (input: CloseCashSessionInput) => Promise<void>;
  readonly addMovement: (input: AddCashMovementInput) => Promise<void>;
} {
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      setSummary(await window.gtrz.cash.getSummary());
    } catch (loadError: unknown) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function execute(operation: () => Promise<CashSummary>, successMessage: string): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      setSummary(await operation());
      setMessage(successMessage);
    } catch (operationError: unknown) {
      setError(getErrorMessage(operationError));
      throw operationError;
    } finally {
      setBusy(false);
    }
  }

  return {
    summary,
    loading,
    busy,
    error,
    message,
    reload,
    open: async (input) => {
      await execute(() => window.gtrz.cash.open(input), 'Caixa aberto.');
    },
    close: async (input) => {
      await execute(() => window.gtrz.cash.close(input), 'Caixa fechado.');
    },
    addMovement: async (input) => {
      await execute(
        () => window.gtrz.cash.addMovement(input),
        input.type === 'supply' ? 'Suprimento registrado.' : 'Sangria registrada.',
      );
    },
  };
}
