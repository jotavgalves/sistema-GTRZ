import { ipcRenderer } from 'electron';

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
  type CancelTicketSaleInput,
  type CreateTicketLotInput,
  type CreateTicketSaleInput,
  type DeleteTicketSaleInput,
  type TicketApi,
  type TicketLot,
  type TicketSale,
  type TicketSaleDeletionResult,
  type TicketState,
  type UpdateTicketLotInput,
} from '@gtrz/contracts';

export const ticketApi:TicketApi={
  async getState():Promise<TicketState>{return ticketStateSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.ticketsGetState));},
  async createLot(input:CreateTicketLotInput):Promise<TicketLot>{return ticketLotSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.ticketsCreateLot,createTicketLotInputSchema.parse(input)));},
  async updateLot(input:UpdateTicketLotInput):Promise<TicketLot>{return ticketLotSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.ticketsUpdateLot,updateTicketLotInputSchema.parse(input)));},
  async createSale(input:CreateTicketSaleInput):Promise<TicketSale>{return ticketSaleSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.ticketsCreateSale,createTicketSaleInputSchema.parse(input)));},
  async cancelSale(input:CancelTicketSaleInput):Promise<TicketSale>{return ticketSaleSchema.parse(await ipcRenderer.invoke(IPC_CHANNELS.ticketsCancelSale,cancelTicketSaleInputSchema.parse(input)));},
  async deleteSale(input:DeleteTicketSaleInput):Promise<TicketSaleDeletionResult>{return ticketSaleDeletionResultSchema.parse(await ipcRenderer.invoke(TICKET_DELETE_SALE_CHANNEL,deleteTicketSaleInputSchema.parse(input)));},
};
