import type { DatabaseContext } from './types';

export function countRestorableOrderUnits(
  database: DatabaseContext,
  eventId: string,
  orderId: string,
): number {
  const row = database.sqlite
    .prepare(
      `SELECT COALESCE(SUM(quantity), 0) AS value
       FROM stock_movements
       WHERE event_id = ?
         AND type = 'sale'
         AND note = ?`,
    )
    .get(eventId, `Venda da comanda ${orderId}`) as { readonly value: number };
  return row.value;
}
