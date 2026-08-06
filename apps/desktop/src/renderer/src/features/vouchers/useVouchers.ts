import { useCallback, useEffect, useState } from 'react';

import type {
  CreateVoucherInput,
  ServicePoint,
  UpdateVoucherInput,
  VoucherDeleteImpact,
  VoucherState,
} from '@gtrz/contracts';

interface VoucherViewState {
  readonly state: VoucherState | null;
  readonly tables: readonly ServicePoint[];
  readonly loading: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly message: string | null;
  readonly reload: () => Promise<void>;
  readonly createVoucher: (input: CreateVoucherInput) => Promise<void>;
  readonly updateVoucher: (input: UpdateVoucherInput) => Promise<void>;
  readonly changeStatus: (voucherId: string, status: 'active' | 'cancelled') => Promise<void>;
  readonly previewDeletion: (voucherId: string) => Promise<VoucherDeleteImpact>;
  readonly deleteVoucher: (voucherId: string, reason: string) => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível atualizar os vouchers.';
}

export function useVouchers(): VoucherViewState {
  const [state, setState] = useState<VoucherState | null>(null);
  const [tables, setTables] = useState<readonly ServicePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const [voucherState, operationState] = await Promise.all([
        window.gtrz.vouchers.getState(),
        window.gtrz.operations.getState(),
      ]);
      setState(voucherState);
      setTables(operationState.servicePoints.filter((servicePoint) => servicePoint.type === 'table'));
    } catch (loadError: unknown) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = useCallback(
    async (operation: () => Promise<unknown>, successMessage: string): Promise<void> => {
      setBusy(true);
      setError(null);
      setMessage(null);

      try {
        await operation();
        await reload();
        setMessage(successMessage);
      } catch (operationError: unknown) {
        const failureMessage = getErrorMessage(operationError);
        setError(failureMessage);
        throw new Error(failureMessage);
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  const createVoucher = useCallback(
    async (input: CreateVoucherInput): Promise<void> => {
      await run(() => window.gtrz.vouchers.create(input), 'Voucher emitido.');
    },
    [run],
  );

  const updateVoucher = useCallback(
    async (input: UpdateVoucherInput): Promise<void> => {
      await run(() => window.gtrz.vouchers.update(input), 'Voucher atualizado.');
    },
    [run],
  );

  const changeStatus = useCallback(
    async (voucherId: string, status: 'active' | 'cancelled'): Promise<void> => {
      await run(
        () => window.gtrz.vouchers.changeStatus({ voucherId, status }),
        status === 'active' ? 'Voucher reativado.' : 'Voucher cancelado.',
      );
    },
    [run],
  );

  const previewDeletion = useCallback(async (voucherId: string): Promise<VoucherDeleteImpact> => {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      return await window.gtrz.vouchers.previewDeletion({ voucherId });
    } catch (operationError: unknown) {
      const failureMessage = getErrorMessage(operationError);
      setError(failureMessage);
      throw new Error(failureMessage);
    } finally {
      setBusy(false);
    }
  }, []);

  const deleteVoucher = useCallback(
    async (voucherId: string, reason: string): Promise<void> => {
      await run(
        () => window.gtrz.vouchers.delete({ voucherId, reason }),
        'Voucher excluído e vendas relacionadas estornadas.',
      );
    },
    [run],
  );

  return {
    state,
    tables,
    loading,
    busy,
    error,
    message,
    reload,
    createVoucher,
    updateVoucher,
    changeStatus,
    previewDeletion,
    deleteVoucher,
  };
}
