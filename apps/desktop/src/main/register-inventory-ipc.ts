import { ipcMain } from 'electron';

import {
  createCategoryInputSchema,
  createProductInputSchema,
  deleteProductInputSchema,
  INVENTORY_ADMIN_CHANNELS,
  inventoryProductSchema,
  inventoryStateSchema,
  IPC_CHANNELS,
  previewProductDeletionInputSchema,
  productAdministrationListSchema,
  productAdministrationSchema,
  productCategorySchema,
  productDeletionImpactSchema,
  productDeletionResultSchema,
  recordStockMovementInputSchema,
  setProductPresentationInputSchema,
  stockTransferListSchema,
  stockTransferSchema,
  transferStockInputSchema,
  updateProductInputSchema,
} from '@gtrz/contracts';
import {
  createInventoryProduct,
  createProductCategory,
  deleteInventoryProduct,
  getInventoryState,
  listProductAdministration,
  listStockTransfers,
  previewProductDeletion,
  recordStockMovement,
  setProductPresentation,
  transferStockBetweenEvents,
  updateInventoryProduct,
  type DatabaseContext,
} from '@gtrz/database';

interface RegisterInventoryIpcOptions {
  readonly getDatabase: () => DatabaseContext;
}

const INVENTORY_CHANNELS = [
  IPC_CHANNELS.inventoryGetState,
  IPC_CHANNELS.inventoryCreateCategory,
  IPC_CHANNELS.inventoryCreateProduct,
  IPC_CHANNELS.inventoryUpdateProduct,
  IPC_CHANNELS.inventoryRecordMovement,
  IPC_CHANNELS.inventoryListTransfers,
  IPC_CHANNELS.inventoryTransferStock,
  INVENTORY_ADMIN_CHANNELS.listAdministration,
  INVENTORY_ADMIN_CHANNELS.setPresentation,
  INVENTORY_ADMIN_CHANNELS.previewDeletion,
  INVENTORY_ADMIN_CHANNELS.deleteProduct,
] as const;

export function registerInventoryIpcHandlers(options: RegisterInventoryIpcOptions): void {
  for (const channel of INVENTORY_CHANNELS) {
    ipcMain.removeHandler(channel);
  }

  ipcMain.handle(IPC_CHANNELS.inventoryGetState, () => {
    return inventoryStateSchema.parse(getInventoryState(options.getDatabase()));
  });

  ipcMain.handle(IPC_CHANNELS.inventoryCreateCategory, (_event, payload: unknown) => {
    const input = createCategoryInputSchema.parse(payload);
    return productCategorySchema.parse(createProductCategory(options.getDatabase(), input.name));
  });

  ipcMain.handle(IPC_CHANNELS.inventoryCreateProduct, (_event, payload: unknown) => {
    const input = createProductInputSchema.parse(payload);
    return inventoryProductSchema.parse(createInventoryProduct(options.getDatabase(), input));
  });

  ipcMain.handle(IPC_CHANNELS.inventoryUpdateProduct, (_event, payload: unknown) => {
    const input = updateProductInputSchema.parse(payload);
    return inventoryProductSchema.parse(updateInventoryProduct(options.getDatabase(), input));
  });

  ipcMain.handle(IPC_CHANNELS.inventoryRecordMovement, (_event, payload: unknown) => {
    const input = recordStockMovementInputSchema.parse(payload);
    const movementInput =
      input.note === undefined
        ? { productId: input.productId, type: input.type, quantity: input.quantity }
        : {
            productId: input.productId,
            type: input.type,
            quantity: input.quantity,
            note: input.note,
          };
    return inventoryProductSchema.parse(recordStockMovement(options.getDatabase(), movementInput));
  });

  ipcMain.handle(IPC_CHANNELS.inventoryListTransfers, () => {
    return stockTransferListSchema.parse(listStockTransfers(options.getDatabase()));
  });

  ipcMain.handle(IPC_CHANNELS.inventoryTransferStock, (_event, payload: unknown) => {
    const input = transferStockInputSchema.parse(payload);
    const transferInput =
      input.note === undefined
        ? {
            productId: input.productId,
            sourceEventId: input.sourceEventId,
            destinationEventId: input.destinationEventId,
            quantity: input.quantity,
          }
        : {
            productId: input.productId,
            sourceEventId: input.sourceEventId,
            destinationEventId: input.destinationEventId,
            quantity: input.quantity,
            note: input.note,
          };
    return stockTransferSchema.parse(
      transferStockBetweenEvents(options.getDatabase(), transferInput),
    );
  });

  ipcMain.handle(INVENTORY_ADMIN_CHANNELS.listAdministration, () =>
    productAdministrationListSchema.parse(listProductAdministration(options.getDatabase())),
  );

  ipcMain.handle(INVENTORY_ADMIN_CHANNELS.setPresentation, (_event, payload: unknown) => {
    const input = setProductPresentationInputSchema.parse(payload);
    return productAdministrationSchema.parse(setProductPresentation(options.getDatabase(), input));
  });

  ipcMain.handle(INVENTORY_ADMIN_CHANNELS.previewDeletion, (_event, payload: unknown) => {
    const input = previewProductDeletionInputSchema.parse(payload);
    return productDeletionImpactSchema.parse(
      previewProductDeletion(options.getDatabase(), input.productId),
    );
  });

  ipcMain.handle(INVENTORY_ADMIN_CHANNELS.deleteProduct, (_event, payload: unknown) => {
    const input = deleteProductInputSchema.parse(payload);
    return productDeletionResultSchema.parse(deleteInventoryProduct(options.getDatabase(), input));
  });
}
