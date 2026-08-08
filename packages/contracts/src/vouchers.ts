import { z } from 'zod';

export const voucherStatusSchema = z.enum(['active', 'exhausted', 'cancelled']);
export const voucherTransactionTypeSchema = z.enum([
  'issue',
  'redemption',
  'cancellation',
  'reactivation',
  'refund',
]);

export const voucherSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  code: z.string().trim().min(4).max(32),
  label: z.string().trim().min(2).max(100),
  initialBalanceCents: z.number().int().positive(),
  remainingBalanceCents: z.number().int().nonnegative(),
  status: voucherStatusSchema,
  servicePointId: z.uuid().nullable(),
  servicePointLabel: z.string().trim().min(1).max(40).nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export const voucherTransactionSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  voucherId: z.uuid(),
  voucherCode: z.string().min(4).max(32),
  orderId: z.uuid().nullable(),
  type: voucherTransactionTypeSchema,
  amountCents: z.number().int().nonnegative(),
  balanceBeforeCents: z.number().int().nonnegative(),
  balanceAfterCents: z.number().int().nonnegative(),
  note: z.string().nullable(),
  createdAt: z.number().int().nonnegative(),
});

export const voucherStateSchema = z.object({
  activeEventId: z.uuid().nullable(),
  vouchers: z.array(voucherSchema),
  transactions: z.array(voucherTransactionSchema),
});

export const createVoucherInputSchema = z.object({
  code: z.string().trim().min(4).max(32).optional(),
  label: z.string().trim().min(2).max(100),
  initialBalanceCents: z.number().int().positive(),
  servicePointId: z.uuid(),
});

export const updateVoucherInputSchema = z.object({
  voucherId: z.uuid(),
  code: z.string().trim().min(4).max(32),
  label: z.string().trim().min(2).max(100),
  servicePointId: z.uuid(),
  addBalanceCents: z.number().int().nonnegative(),
});

export const changeVoucherStatusInputSchema = z.object({
  voucherId: z.uuid(),
  status: z.enum(['active', 'cancelled']),
});

export const voucherDeleteImpactSchema = z.object({
  voucherId: z.uuid(),
  code: z.string().min(4).max(32),
  paidOrderCount: z.number().int().nonnegative(),
  paidOrderTotalCents: z.number().int().nonnegative(),
  voucherRedemptionCents: z.number().int().nonnegative(),
  restoredUnits: z.number().int().nonnegative(),
});

export const previewVoucherDeletionInputSchema = z.object({
  voucherId: z.uuid(),
});

export const deleteVoucherInputSchema = z.object({
  voucherId: z.uuid(),
  reason: z.string().trim().min(3).max(240),
});

export const voucherDeleteResultSchema = voucherDeleteImpactSchema.extend({
  deletedAt: z.number().int().nonnegative(),
});

export type VoucherStatus = z.infer<typeof voucherStatusSchema>;
export type VoucherTransactionType = z.infer<typeof voucherTransactionTypeSchema>;
export type Voucher = z.infer<typeof voucherSchema>;
export type VoucherTransaction = z.infer<typeof voucherTransactionSchema>;
export type VoucherState = z.infer<typeof voucherStateSchema>;
export type CreateVoucherInput = z.infer<typeof createVoucherInputSchema>;
export type UpdateVoucherInput = z.infer<typeof updateVoucherInputSchema>;
export type ChangeVoucherStatusInput = z.infer<typeof changeVoucherStatusInputSchema>;
export type VoucherDeleteImpact = z.infer<typeof voucherDeleteImpactSchema>;
export type PreviewVoucherDeletionInput = z.infer<typeof previewVoucherDeletionInputSchema>;
export type DeleteVoucherInput = z.infer<typeof deleteVoucherInputSchema>;
export type VoucherDeleteResult = z.infer<typeof voucherDeleteResultSchema>;

export interface VoucherApi {
  getState(): Promise<VoucherState>;
  create(input: CreateVoucherInput): Promise<Voucher>;
  update(input: UpdateVoucherInput): Promise<Voucher>;
  changeStatus(input: ChangeVoucherStatusInput): Promise<Voucher>;
  previewDeletion(input: PreviewVoucherDeletionInput): Promise<VoucherDeleteImpact>;
  delete(input: DeleteVoucherInput): Promise<VoucherDeleteResult>;
}
