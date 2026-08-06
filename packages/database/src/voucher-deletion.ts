import { appendAudit } from './audit';
import { getSessionState } from './control';
import { cancelOrder } from './operation-cancellation';
import type { DatabaseContext } from './types';

export interface DatabaseVoucherDeleteImpact {
  readonly voucherId: string;
  readonly code: string;
  readonly paidOrderCount: number;
  readonly paidOrderTotalCents: number;
  readonly voucherRedemptionCents: number;
}

export interface DatabaseVoucherDeleteResult extends DatabaseVoucherDeleteImpact {
  readonly deletedAt: number;
}

interface VoucherRow {
  readonly id: string;
  readonly event_id: string;
  readonly code: string;
  readonly deleted_at: number | null;
}

interface PaidOrderRow {
  readonly id: string;
  readonly total_cents: number;
}

function requireProduction(database: DatabaseContext): void {
  if (getSessionState(database).profile !== 'production') {
    throw new Error('A exclusão de vouchers exige o perfil Produção.');
  }
}

function requireActiveEvent(database: DatabaseContext): string {
  const eventId = getSessionState(database).activeEvent?.id;

  if (eventId === undefined) {
    throw new Error('Selecione um evento aberto antes de excluir vouchers.');
  }

  return eventId;
}

function requireVoucher(database: DatabaseContext, voucherId: string, eventId: string): VoucherRow {
  const voucher = database.sqlite
    .prepare(
      `SELECT id, event_id, code, deleted_at
       FROM vouchers
       WHERE id = ?`,
    )
    .get(voucherId) as VoucherRow | undefined;

  if (voucher === undefined || voucher.deleted_at !== null) {
    throw new Error('O voucher informado não existe ou já foi excluído.');
  }

  if (voucher.event_id !== eventId) {
    throw new Error('O voucher não pertence ao evento ativo.');
  }

  return voucher;
}

function listPaidOrders(database: DatabaseContext, voucherId: string): readonly PaidOrderRow[] {
  return database.sqlite
    .prepare(
      `SELECT DISTINCT o.id, o.total_cents
       FROM voucher_transactions vt
       INNER JOIN orders o ON o.id = vt.order_id
       WHERE vt.voucher_id = ?
         AND vt.type = 'redemption'
         AND o.status = 'paid'
       ORDER BY o.opened_at`,
    )
    .all(voucherId) as PaidOrderRow[];
}

function sumVoucherRedemptions(database: DatabaseContext, voucherId: string): number {
  const row = database.sqlite
    .prepare(
      `SELECT COALESCE(SUM(vt.amount_cents), 0) AS value
       FROM voucher_transactions vt
       INNER JOIN orders o ON o.id = vt.order_id
       WHERE vt.voucher_id = ?
         AND vt.type = 'redemption'
         AND o.status = 'paid'`,
    )
    .get(voucherId) as { readonly value: number };
  return row.value;
}

export function previewVoucherDeletion(
  database: DatabaseContext,
  voucherId: string,
): DatabaseVoucherDeleteImpact {
  requireProduction(database);
  const eventId = requireActiveEvent(database);
  const voucher = requireVoucher(database, voucherId, eventId);
  const paidOrders = listPaidOrders(database, voucher.id);

  return {
    voucherId: voucher.id,
    code: voucher.code,
    paidOrderCount: paidOrders.length,
    paidOrderTotalCents: paidOrders.reduce((total, order) => total + order.total_cents, 0),
    voucherRedemptionCents: sumVoucherRedemptions(database, voucher.id),
  };
}

export function deleteVoucher(
  database: DatabaseContext,
  input: { readonly voucherId: string; readonly reason: string },
): DatabaseVoucherDeleteResult {
  requireProduction(database);
  const eventId = requireActiveEvent(database);
  const voucher = requireVoucher(database, input.voucherId, eventId);
  const reason = input.reason.trim();

  if (reason.length < 3) {
    throw new Error('Informe um motivo para excluir o voucher.');
  }

  const impact = previewVoucherDeletion(database, voucher.id);
  const paidOrders = listPaidOrders(database, voucher.id);
  const now = Date.now();

  database.sqlite.transaction(() => {
    database.sqlite
      .prepare('DELETE FROM order_voucher_allocations WHERE voucher_id = ?')
      .run(voucher.id);

    for (const order of paidOrders) {
      cancelOrder(database, {
        orderId: order.id,
        reason: `Exclusão do voucher ${voucher.code}: ${reason}`,
      });
    }

    database.sqlite
      .prepare(
        `UPDATE vouchers
         SET status = 'cancelled', service_point_id = NULL, deleted_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(now, now, voucher.id);

    appendAudit(database, {
      action: 'voucher.deleted',
      entityType: 'voucher',
      entityId: voucher.id,
      eventId,
      details: {
        code: voucher.code,
        reason,
        cancelledOrderIds: paidOrders.map((order) => order.id),
        paidOrderCount: impact.paidOrderCount,
        paidOrderTotalCents: impact.paidOrderTotalCents,
        voucherRedemptionCents: impact.voucherRedemptionCents,
      },
    });
  })();

  return { ...impact, deletedAt: now };
}
