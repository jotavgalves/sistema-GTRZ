import { ipcMain } from 'electron';

import {
  cancelTicketSaleInputSchema,
  createTicketLotInputSchema,
  createTicketSaleInputSchema,
  deleteTicketSaleInputSchema,
  IPC_CHANNELS,
  TICKET_DELETE_SALE_CHANNEL,
  ticketLotSchema,
  ticketSaleDeletionResultSchema,
  ticketSaleSchema,
  ticketStateSchema,
  updateTicketLotInputSchema,
} from '@gtrz/contracts';
import {
  cancelTicketSale,
  createTicketLot,
  createTicketSale,
  deleteTicketSale,
  getTicketState,
  updateTicketLot,
  type DatabaseContext,
} from '@gtrz/database';

interface RegisterTicketIpcOptions {
  readonly getDatabase: () => DatabaseContext;
}
const TICKET_CHANNELS = [
  IPC_CHANNELS.ticketsGetState,
  IPC_CHANNELS.ticketsCreateLot,
  IPC_CHANNELS.ticketsUpdateLot,
  IPC_CHANNELS.ticketsCreateSale,
  IPC_CHANNELS.ticketsCancelSale,
  TICKET_DELETE_SALE_CHANNEL,
] as const;
export function registerTicketIpcHandlers(options: RegisterTicketIpcOptions): void {
  for (const channel of TICKET_CHANNELS) ipcMain.removeHandler(channel);
  ipcMain.handle(IPC_CHANNELS.ticketsGetState, () =>
    ticketStateSchema.parse(getTicketState(options.getDatabase())),
  );
  ipcMain.handle(IPC_CHANNELS.ticketsCreateLot, (_event, payload: unknown) =>
    ticketLotSchema.parse(
      createTicketLot(options.getDatabase(), createTicketLotInputSchema.parse(payload)),
    ),
  );
  ipcMain.handle(IPC_CHANNELS.ticketsUpdateLot, (_event, payload: unknown) =>
    ticketLotSchema.parse(
      updateTicketLot(options.getDatabase(), updateTicketLotInputSchema.parse(payload)),
    ),
  );
  ipcMain.handle(IPC_CHANNELS.ticketsCreateSale, (_event, payload: unknown) => {
    const input = createTicketSaleInputSchema.parse(payload);
    const dbInput = {
      lotId: input.lotId,
      attendeeName: input.attendeeName,
      source: input.source,
      quantity: input.quantity,
      ...(input.paymentMethod === undefined ? {} : { paymentMethod: input.paymentMethod }),
      ...(input.manualCodes === undefined ? {} : { manualCodes: input.manualCodes }),
    };
    return ticketSaleSchema.parse(createTicketSale(options.getDatabase(), dbInput));
  });
  ipcMain.handle(IPC_CHANNELS.ticketsCancelSale, (_event, payload: unknown) =>
    ticketSaleSchema.parse(
      cancelTicketSale(options.getDatabase(), cancelTicketSaleInputSchema.parse(payload)),
    ),
  );
  ipcMain.handle(TICKET_DELETE_SALE_CHANNEL, (_event, payload: unknown) =>
    ticketSaleDeletionResultSchema.parse(
      deleteTicketSale(options.getDatabase(), deleteTicketSaleInputSchema.parse(payload)),
    ),
  );
}
