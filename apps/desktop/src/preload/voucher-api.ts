import { ipcRenderer } from 'electron';

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
  type ChangeVoucherStatusInput,
  type CreateVoucherInput,
  type DeleteVoucherInput,
  type PreviewVoucherDeletionInput,
  type UpdateVoucherInput,
  type Voucher,
  type VoucherApi,
  type VoucherDeleteImpact,
  type VoucherDeleteResult,
  type VoucherState,
} from '@gtrz/contracts';

export const voucherApi: VoucherApi = {
  async getState(): Promise<VoucherState> {
    const payload: unknown = await ipcRenderer.invoke(IPC_CHANNELS.vouchersGetState);
    return voucherStateSchema.parse(payload);
  },

  async create(input: CreateVoucherInput): Promise<Voucher> {
    const parsedInput = createVoucherInputSchema.parse(input);
    const payload: unknown = await ipcRenderer.invoke(IPC_CHANNELS.vouchersCreate, parsedInput);
    return voucherSchema.parse(payload);
  },

  async update(input: UpdateVoucherInput): Promise<Voucher> {
    const parsedInput = updateVoucherInputSchema.parse(input);
    const payload: unknown = await ipcRenderer.invoke(IPC_CHANNELS.vouchersUpdate, parsedInput);
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

  async previewDeletion(input: PreviewVoucherDeletionInput): Promise<VoucherDeleteImpact> {
    const parsedInput = previewVoucherDeletionInputSchema.parse(input);
    const payload: unknown = await ipcRenderer.invoke(
      IPC_CHANNELS.vouchersPreviewDeletion,
      parsedInput,
    );
    return voucherDeleteImpactSchema.parse(payload);
  },

  async delete(input: DeleteVoucherInput): Promise<VoucherDeleteResult> {
    const parsedInput = deleteVoucherInputSchema.parse(input);
    const payload: unknown = await ipcRenderer.invoke(IPC_CHANNELS.vouchersDelete, parsedInput);
    return voucherDeleteResultSchema.parse(payload);
  },
};
