import { randomUUID } from 'node:crypto';

import { getSessionState } from './control';
import type { DatabaseContext } from './types';

export type DatabaseVoucherStatus = 'active' | 'exhausted' | 'cancelled';
export type DatabaseVoucherTransactionType =
  | 'issue'
  | 'redemption'
  | 'cancellation'
  | 'reactivation'
  | 'refund';

export interface DatabaseVoucher {
  readonly id: string;
  readonly eventId: string;
  readonly code: string;
  readonly label: string;
  readonly initialBalanceCents: number;
  readonly remainingBalanceCents: number;
  readonly status: DatabaseVoucherStatus;
  readonly servicePointId: string | null;
  readonly servicePointLabel: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface DatabaseVoucherTransaction {
  readonly id: string;
  readonly eventId: string;
  readonly voucherId: string;
  readonly voucherCode: string;
  readonly orderId: string | null;
  readonly type: DatabaseVoucherTransactionType;
  readonly amountCents: number;
  readonly balanceBeforeCents: number;
  readonly balanceAfterCents: number;
  readonly note: string | null;
  readonly createdAt: number;
}

export interface DatabaseVoucherState {
  readonly activeEventId: string | null;
  readonly vouchers: readonly DatabaseVoucher[];
  readonly transactions: readonly DatabaseVoucherTransaction[];
}

export interface DatabaseVoucherUseInput {
  readonly code: string;
  readonly amountCents: number;
}

export interface DatabaseVoucherRedemption {
  readonly voucherId: string;
  readonly code: string;
  readonly amountCents: number;
}

interface VoucherRow {
  readonly id: string;
  readonly event_id: string;
  readonly code: string;
  readonly label: string;
  readonly initial_balance_cents: number;
  readonly remaining_balance_cents: number;
  readonly status: DatabaseVoucherStatus;
  readonly service_point_id: string | null;
  readonly service_point_label: string | null;
  readonly deleted_at: number | null;
  readonly created_at: number;
  readonly updated_at: number;
}

interface VoucherTransactionRow {
  readonly id: string;
  readonly event_id: string;
  readonly voucher_id: string;
  readonly voucher_code: string;
  readonly order_id: string | null;
  readonly type: DatabaseVoucherTransactionType;
  readonly amount_cents: number;
  readonly balance_before_cents: number;
  readonly balance_after_cents: number;
  readonly note: string | null;
  readonly created_at: number;
}

interface RefundRow {
  readonly voucher_id: string;
  readonly voucher_code: string;
  readonly amount_cents: number;
}

function normalizeCode(code: string): string {
  return code.trim().toLocaleUpperCase('pt-BR').replaceAll(/\s+/gu, '-');
}

function selectVoucherSql(where: string): string {
  return `SELECT
            v.id,
            v.event_id,
            v.code,
            v.label,
            v.initial_balance_cents,
            v.remaining_balance_cents,
            v.status,
            v.service_point_id,
            sp.label AS service_point_label,
            v.deleted_at,
            v.created_at,
            v.updated_at
          FROM vouchers v
          LEFT JOIN service_points sp ON sp.id = v.service_point_id
          WHERE ${where}`;
}

function mapVoucher(row: VoucherRow): DatabaseVoucher {
  return {
    id: row.id,
    eventId: row.event_id,
    code: row.code,
    label: row.label,
    initialBalanceCents: row.initial_balance_cents,
    remainingBalanceCents: row.remaining_balance_cents,
    status: row.status,
    servicePointId: row.service_point_id,
    servicePointLabel: row.service_point_label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTransaction(row: VoucherTransactionRow): DatabaseVoucherTransaction {
  return {
    id: row.id,
    eventId: row.event_id,
    voucherId: row.voucher_id,
    voucherCode: row.voucher_code,
    orderId: row.order_id,
    type: row.type,
    amountCents: row.amount_cents,
    balanceBeforeCents: row.balance_before_cents,
    balanceAfterCents: row.balance_after_cents,
    note: row.note,
    createdAt: row.created_at,
  };
}

function requireVoucherById(database: DatabaseContext, voucherId: string): VoucherRow {
  const row = database.sqlite.prepare(selectVoucherSql('v.id = ?')).get(voucherId) as
    | VoucherRow
    | undefined;

  if (row?.deleted_at !== null) {
    throw new Error('O voucher informado não existe ou foi excluído.');
  }

  return row;
}

function requireVoucherByCode(
  database: DatabaseContext,
  eventId: string,
  code: string,
): VoucherRow {
  const normalizedCode = normalizeCode(code);
  const row = database.sqlite
    .prepare(selectVoucherSql('v.event_id = ? AND v.code = ? COLLATE NOCASE'))
    .get(eventId, normalizedCode) as VoucherRow | undefined;

  if (row?.deleted_at !== null) {
    throw new Error(`Voucher ${normalizedCode} não encontrado neste evento.`);
  }

  return row;
}

function insertTransaction(
  database: DatabaseContext,
  input: Omit<DatabaseVoucherTransaction, 'id'>,
): void {
  database.sqlite
    .prepare(
      `INSERT INTO voucher_transactions
       (id, event_id, voucher_id, voucher_code, order_id, type, amount_cents,
        balance_before_cents, balance_after_cents, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      input.eventId,
      input.voucherId,
      input.voucherCode,
      input.orderId,
      input.type,
      input.amountCents,
      input.balanceBeforeCents,
      input.balanceAfterCents,
      input.note,
      input.createdAt,
    );
}

export function getVoucherState(database: DatabaseContext): DatabaseVoucherState {
  const eventId = getSessionState(database).activeEvent?.id ?? null;

  if (eventId === null) {
    return { activeEventId: null, vouchers: [], transactions: [] };
  }

  const vouchers = database.sqlite
    .prepare(
      `${selectVoucherSql('v.event_id = ? AND v.deleted_at IS NULL')}
       ORDER BY CASE v.status WHEN 'active' THEN 0 WHEN 'exhausted' THEN 1 ELSE 2 END,
                v.updated_at DESC`,
    )
    .all(eventId) as VoucherRow[];
  const transactions = database.sqlite
    .prepare(
      `SELECT id, event_id, voucher_id, voucher_code, order_id, type, amount_cents,
              balance_before_cents, balance_after_cents, note, created_at
       FROM voucher_transactions
       WHERE event_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 100`,
    )
    .all(eventId) as VoucherTransactionRow[];

  return {
    activeEventId: eventId,
    vouchers: vouchers.map(mapVoucher),
    transactions: transactions.map(mapTransaction),
  };
}

export function redeemVouchers(
  database: DatabaseContext,
  eventId: string,
  orderId: string,
  uses: readonly DatabaseVoucherUseInput[],
  now: number,
): readonly DatabaseVoucherRedemption[] {
  const normalizedCodes = uses.map((use) => normalizeCode(use.code));

  if (new Set(normalizedCodes).size !== normalizedCodes.length) {
    throw new Error('O mesmo voucher não pode ser informado duas vezes na comanda.');
  }

  return uses.map((use) => {
    if (!Number.isInteger(use.amountCents) || use.amountCents <= 0) {
      throw new Error('O valor utilizado do voucher deve ser positivo.');
    }

    const voucher = requireVoucherByCode(database, eventId, use.code);

    if (voucher.status !== 'active') {
      throw new Error(`O voucher ${voucher.code} não está ativo.`);
    }

    if (voucher.remaining_balance_cents < use.amountCents) {
      const available = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(voucher.remaining_balance_cents / 100);
      throw new Error(`Saldo insuficiente no voucher ${voucher.code}. Disponível: ${available}.`);
    }

    const nextBalance = voucher.remaining_balance_cents - use.amountCents;
    const nextStatus: DatabaseVoucherStatus = nextBalance === 0 ? 'exhausted' : 'active';
    database.sqlite
      .prepare(
        `UPDATE vouchers
         SET remaining_balance_cents = ?, status = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(nextBalance, nextStatus, now, voucher.id);
    insertTransaction(database, {
      eventId,
      voucherId: voucher.id,
      voucherCode: voucher.code,
      orderId,
      type: 'redemption',
      amountCents: use.amountCents,
      balanceBeforeCents: voucher.remaining_balance_cents,
      balanceAfterCents: nextBalance,
      note: null,
      createdAt: now,
    });

    return { voucherId: voucher.id, code: voucher.code, amountCents: use.amountCents };
  });
}

export function listOrderVoucherRedemptions(
  database: DatabaseContext,
  orderId: string,
): readonly DatabaseVoucherRedemption[] {
  const rows = database.sqlite
    .prepare(
      `SELECT voucher_id, voucher_code, SUM(amount_cents) AS amount_cents
       FROM voucher_transactions
       WHERE order_id = ? AND type = 'redemption'
       GROUP BY voucher_id, voucher_code
       ORDER BY voucher_code`,
    )
    .all(orderId) as RefundRow[];
  return rows.map((row) => ({
    voucherId: row.voucher_id,
    code: row.voucher_code,
    amountCents: row.amount_cents,
  }));
}

export function refundOrderVouchers(
  database: DatabaseContext,
  eventId: string,
  orderId: string,
  now: number,
): number {
  const alreadyRefunded = database.sqlite
    .prepare(
      `SELECT 1 FROM voucher_transactions
       WHERE order_id = ? AND type = 'refund'
       LIMIT 1`,
    )
    .get(orderId);

  if (alreadyRefunded !== undefined) {
    throw new Error('Os vouchers desta comanda já foram restituídos.');
  }

  const redemptions = listOrderVoucherRedemptions(database, orderId);

  for (const redemption of redemptions) {
    const voucher = requireVoucherById(database, redemption.voucherId);

    if (voucher.event_id !== eventId) {
      throw new Error('Um voucher utilizado não pertence ao evento da comanda.');
    }

    const nextBalance = voucher.remaining_balance_cents + redemption.amountCents;

    if (nextBalance > voucher.initial_balance_cents) {
      throw new Error(`A restituição ultrapassaria o saldo inicial do voucher ${voucher.code}.`);
    }

    const nextStatus: DatabaseVoucherStatus =
      voucher.status === 'cancelled' ? 'cancelled' : 'active';
    database.sqlite
      .prepare(
        `UPDATE vouchers
         SET remaining_balance_cents = ?, status = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(nextBalance, nextStatus, now, voucher.id);
    insertTransaction(database, {
      eventId,
      voucherId: voucher.id,
      voucherCode: voucher.code,
      orderId,
      type: 'refund',
      amountCents: redemption.amountCents,
      balanceBeforeCents: voucher.remaining_balance_cents,
      balanceAfterCents: nextBalance,
      note: 'Estorno da comanda',
      createdAt: now,
    });
  }

  return redemptions.reduce((total, redemption) => total + redemption.amountCents, 0);
}
