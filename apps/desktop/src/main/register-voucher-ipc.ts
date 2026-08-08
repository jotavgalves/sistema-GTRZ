import { ipcMain } from 'electron';

import {
  changeVoucherStatusInputSchema,
  createVoucherInputSchema,
  deleteVoucherInputSchema,
  IPC_CHANNELS,
  previewVoucherDeletionInputSchema,
  updateVoucherInputSchema,
  voucherDeleteImpactSchema,
  voucherDeleteResultSchema,
  voucherSchema,
  voucherStateSchema,
} from '@gtrz/contracts';
import {
  changeVoucherStatus,
  createVoucher,
  deleteVoucher,
  getVoucherState,
  previewVoucherDeletion,
  type DatabaseContext,
  updateVoucher,
} from '@gtrz/database';

interface RegisterVoucherIpcOptions {
  readonly getDatabase: () => DatabaseContext;
}

const VOUCHER_CHANNELS = [
  IPC_CHANNELS.vouchersGetState,
  IPC_CHANNELS.vouchersCreate,
  IPC_CHANNELS.vouchersUpdate,
  IPC_CHANNELS.vouchersChangeStatus,
  IPC_CHANNELS.vouchersPreviewDeletion,
  IPC_CHANNELS.vouchersDelete,
] as const;

export function registerVoucherIpcHandlers(options: RegisterVoucherIpcOptions): void {
  for (const channel of VOUCHER_CHANNELS) {
    ipcMain.removeHandler(channel);
  }

  ipcMain.handle(IPC_CHANNELS.vouchersGetState, () => {
    return voucherStateSchema.parse(getVoucherState(options.getDatabase()));
  });

  ipcMain.handle(IPC_CHANNELS.vouchersCreate, (_event, payload: unknown) => {
    const input = createVoucherInputSchema.parse(payload);
    const baseInput = {
      label: input.label,
      initialBalanceCents: input.initialBalanceCents,
      servicePointId: input.servicePointId,
    };
    const databaseInput = input.code === undefined ? baseInput : { ...baseInput, code: input.code };
    return voucherSchema.parse(createVoucher(options.getDatabase(), databaseInput));
  });

  ipcMain.handle(IPC_CHANNELS.vouchersUpdate, (_event, payload: unknown) => {
    const input = updateVoucherInputSchema.parse(payload);
    return voucherSchema.parse(updateVoucher(options.getDatabase(), input));
  });

  ipcMain.handle(IPC_CHANNELS.vouchersChangeStatus, (_event, payload: unknown) => {
    const input = changeVoucherStatusInputSchema.parse(payload);
    return voucherSchema.parse(changeVoucherStatus(options.getDatabase(), input));
  });

  ipcMain.handle(IPC_CHANNELS.vouchersPreviewDeletion, (_event, payload: unknown) => {
    const input = previewVoucherDeletionInputSchema.parse(payload);
    return voucherDeleteImpactSchema.parse(
      previewVoucherDeletion(options.getDatabase(), input.voucherId),
    );
  });

  ipcMain.handle(IPC_CHANNELS.vouchersDelete, (_event, payload: unknown) => {
    const input = deleteVoucherInputSchema.parse(payload);
    return voucherDeleteResultSchema.parse(deleteVoucher(options.getDatabase(), input));
  });
}
