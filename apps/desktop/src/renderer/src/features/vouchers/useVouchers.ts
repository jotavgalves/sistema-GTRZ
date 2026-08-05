import { useCallback, useEffect, useState } from 'react';

import type { ChangeVoucherStatusInput, CreateVoucherInput, VoucherState } from '@gtrz/contracts';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu uma falha inesperada.';
}

export function useVouchers(): {
  readonly state: VoucherState | null;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly message: string | null;
  readonly reload: () => Promise<void>;
  readonly create: (input: CreateVoucherInput) => Promise<void>;
  readonly changeStatus: (input: ChangeVoucherStatusInput) => Promise<void>;
} {
  const [state, setState] = useState<VoucherState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      setState(await window.gtrz.vouchers.getState());
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
      setState(await window.gtrz.vouchers.getState());
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
    create: async (input) => {
      await execute(() => window.gtrz.vouchers.create(input), 'Voucher emitido.');
    },
    changeStatus: async (input) => {
      await execute(
        () => window.gtrz.vouchers.changeStatus(input),
        input.action === 'cancel' ? 'Voucher cancelado.' : 'Voucher reativado.',
      );
    },
  };
}
