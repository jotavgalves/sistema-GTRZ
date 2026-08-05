import { z } from 'zod';

export const servicePointTypeSchema = z.enum(['table', 'counter']);
export const servicePointStatusSchema = z.enum(['available', 'open']);
export const orderStatusSchema = z.enum(['open', 'paid', 'cancelled']);
export const orderItemKindSchema = z.enum(['product', 'combo']);
export const paymentMethodSchema = z.enum(['cash', 'pix', 'credit-card', 'debit-card']);

export const servicePointSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  label: z.string().trim().min(1).max(40),
  type: servicePointTypeSchema,
  status: servicePointStatusSchema,
  activeOrderId: z.uuid().nullable(),
  activeOrderTotalCents: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export const orderItemSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  itemKind: orderItemKindSchema,
  itemId: z.uuid(),
  itemName: z.string().trim().min(1).max(120),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  totalCents: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
});

export const paymentSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  method: paymentMethodSchema,
  amountCents: z.number().int().positive(),
  receivedCents: z.number().int().positive().nullable(),
  changeCents: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
});

export const orderSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  servicePointId: z.uuid(),
  servicePointLabel: z.string().trim().min(1).max(40),
  status: orderStatusSchema,
  subtotalCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative(),
  totalCents: z.number().int().nonnegative(),
  paidCents: z.number().int().nonnegative(),
  remainingCents: z.number().int().nonnegative(),
  items: z.array(orderItemSchema),
  payments: z.array(paymentSchema),
  openedAt: z.number().int().nonnegative(),
  closedAt: z.number().int().nonnegative().nullable(),
  updatedAt: z.number().int().nonnegative(),
});

export const operationCatalogItemSchema = z.object({
  id: z.uuid(),
  kind: orderItemKindSchema,
  name: z.string().trim().min(1).max(120),
  salePriceCents: z.number().int().nonnegative(),
  availableQuantity: z.number().int().nonnegative(),
  active: z.boolean(),
});

export const operationStateSchema = z.object({
  activeEventId: z.uuid().nullable(),
  servicePoints: z.array(servicePointSchema),
  catalog: z.array(operationCatalogItemSchema),
});

export const createServicePointInputSchema = z.object({
  label: z.string().trim().min(1).max(40),
  type: servicePointTypeSchema,
});

export const openOrderInputSchema = z.object({
  servicePointId: z.uuid(),
});

export const getOrderInputSchema = z.object({
  orderId: z.uuid(),
});

export const addOrderItemInputSchema = z.object({
  orderId: z.uuid(),
  itemKind: orderItemKindSchema,
  itemId: z.uuid(),
  quantity: z.number().int().positive(),
});

export const removeOrderItemInputSchema = z.object({
  orderId: z.uuid(),
  orderItemId: z.uuid(),
});

export const closeOrderInputSchema = z.object({
  orderId: z.uuid(),
  discountCents: z.number().int().nonnegative().default(0),
  payments: z
    .array(
      z.object({
        method: paymentMethodSchema,
        amountCents: z.number().int().positive(),
        receivedCents: z.number().int().positive().optional(),
      }),
    )
    .min(1),
});

export type ServicePointType = z.infer<typeof servicePointTypeSchema>;
export type ServicePointStatus = z.infer<typeof servicePointStatusSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type OrderItemKind = z.infer<typeof orderItemKindSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type ServicePoint = z.infer<typeof servicePointSchema>;
export type OrderItem = z.infer<typeof orderItemSchema>;
export type Payment = z.infer<typeof paymentSchema>;
export type Order = z.infer<typeof orderSchema>;
export type OperationCatalogItem = z.infer<typeof operationCatalogItemSchema>;
export type OperationState = z.infer<typeof operationStateSchema>;
export type CreateServicePointInput = z.infer<typeof createServicePointInputSchema>;
export type OpenOrderInput = z.infer<typeof openOrderInputSchema>;
export type GetOrderInput = z.infer<typeof getOrderInputSchema>;
export type AddOrderItemInput = z.infer<typeof addOrderItemInputSchema>;
export type RemoveOrderItemInput = z.infer<typeof removeOrderItemInputSchema>;
export type CloseOrderInput = z.infer<typeof closeOrderInputSchema>;

export interface OperationsApi {
  getState(): Promise<OperationState>;
  createServicePoint(input: CreateServicePointInput): Promise<ServicePoint>;
  openOrder(input: OpenOrderInput): Promise<Order>;
  getOrder(orderId: string): Promise<Order>;
  addItem(input: AddOrderItemInput): Promise<Order>;
  removeItem(input: RemoveOrderItemInput): Promise<Order>;
  closeOrder(input: CloseOrderInput): Promise<Order>;
}
