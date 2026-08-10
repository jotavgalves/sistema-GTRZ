import type { DatabaseContext } from './types';

interface StockCostRow {
  readonly cost_cents: number;
  readonly movement_units: number;
  readonly transfer_in_units: number;
  readonly transfer_out_units: number;
}

export function getEventStockCostCents(database: DatabaseContext, eventId: string): number {
  const rows = database.sqlite
    .prepare(
      `SELECT
         p.cost_cents,
         COALESCE((
           SELECT SUM(
             CASE sm.type
               WHEN 'purchase' THEN sm.quantity
               WHEN 'correction-positive' THEN sm.quantity
               WHEN 'correction-negative' THEN -sm.quantity
               ELSE 0
             END
           )
           FROM stock_movements sm
           WHERE sm.event_id = ? AND sm.product_id = p.id
         ), 0) AS movement_units,
         COALESCE((
           SELECT SUM(st.quantity)
           FROM stock_transfers st
           WHERE st.destination_event_id = ? AND st.product_id = p.id
         ), 0) AS transfer_in_units,
         COALESCE((
           SELECT SUM(st.quantity)
           FROM stock_transfers st
           WHERE st.source_event_id = ? AND st.product_id = p.id
         ), 0) AS transfer_out_units
       FROM products p
       WHERE EXISTS (
         SELECT 1 FROM stock_movements sm
         WHERE sm.event_id = ? AND sm.product_id = p.id
       ) OR EXISTS (
         SELECT 1 FROM stock_transfers st
         WHERE (st.source_event_id = ? OR st.destination_event_id = ?) AND st.product_id = p.id
       )`,
    )
    .all(eventId, eventId, eventId, eventId, eventId, eventId) as StockCostRow[];

  return rows.reduce((total, row) => {
    const assignedUnits = Math.max(
      row.movement_units + row.transfer_in_units - row.transfer_out_units,
      0,
    );
    return total + assignedUnits * row.cost_cents;
  }, 0);
}
