import { randomBytes, randomUUID } from 'node:crypto';

import { appendAudit } from './audit';
import { getSessionState } from './control';
import type { DatabaseContext } from './types';

export type DatabaseVoucherOrigin = 'pre-sale' | 'local-sale' | 'courtesy';
export type DatabaseVoucherStatus = 'active' | 'depleted' | 'cancelled';

export interface DatabaseVoucher {
  readonly id: string;
  readonly eventId: string;
  readonly code: string;
  readonly origin: DatabaseVoucherOrigin;
  readonly status: DatabaseVoucherStatus;
  readonly initialBalanceCents: number;
  readonly balanceCents: number;
  readonly tableId: string | null;
  readonly tableName: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface DatabaseVoucherState {
  readonly activeEventId: string | null;
  readonly vouchers: readonly DatabaseVoucher[];
}

interface VoucherRow {
  readonly id: string;
  readonly event_id: string;
  readonly code: string;
  readonly origin: DatabaseVoucherOrigin;
  readonly status: DatabaseVoucherStatus;
  readonly initial_balance_cents: number;
  readonly balance_cents: number;
  readonly table_id: string | null;
  readonly table_name: string | null;
  readonly created_at: number;
  readonly updated_at: number;
}

function requireProduction(database: DatabaseContext): void {
  if (getSessionState(database).profile !== 'production') {
    throw new Error('Esta operação de voucher exige o perfil Produção.');
  }
}

function requireActiveEventId(database: DatabaseContext): string {
  const eventId = getSessionState(database).activeEvent?.id;

  if (eventId === undefined) {
    throw new Error('Selecione um evento aberto para operar vouchers.');
  }

  return eventId;
}

function mapVoucher(row: VoucherRow): DatabaseVoucher {
  return {
    id: row.id,
    eventId: row.event_id,
    code: row.code,
    origin: row.origin,
    status: row.status,
    initialBalanceCents: row.initial_balance_cents,
    balanceCents: row.balance_cents,
    tableId: row.table_id,
    tableName: row.table_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getVoucherRow(
  database: DatabaseContext,
  eventId: string,
  code: string,
): VoucherRow | undefined {
  return database.sqlite
    .prepare(
      `SELECT
         v.id,
         v.event_id,
         v.code,
         v.origin,
         v.status,
         v.initial_balance_cents,
         v.balance_cents,
         v.table_id,
         st.name AS table_name,
         v.created_at,
         v.updated_at
       FROM vouchers v
       LEFT JOIN sale_tables st ON st.id = v.table_id
       WHERE v.event_id = ? AND v.code = ? COLLATE NOCASE`,
    )
    .get(eventId, code) as VoucherRow | undefined;
}

function getVoucherById(database: DatabaseContext, voucherId: string): DatabaseVoucher {
  const row = database.sqlite
    .prepare(
      `SELECT
         v.id,
         v.event_id,
         v.code,
         v.origin,
         v.status,
         v.initial_balance_cents,
         v.balance_cents,
         v.table_id,
         st.name AS table_name,
         v.created_at,
         v.updated_at
       FROM vouchers v
       LEFT JOIN sale_tables st ON st.id = v.table_id
       WHERE v.id = ?`,
    )
    .get(voucherId) as VoucherRow | undefined;

  if (row === undefined) {
    throw new Error('O voucher informado não existe.');
  }

  return mapVoucher(row);
}

function generateVoucherCode(): string {
  return `GTRZ-${randomBytes(5).toString('hex').toUpperCase()}`;
}

function recordVoucherMovement(
  database: DatabaseContext,
  input: {
    readonly voucherId: string;
    readonly eventId: string;
    readonly type: 'issue' | 'redeem' | 'refund' | 'cancel' | 'reactivate';
    readonly amountCents: number;
    readonly balanceBeforeCents: number;
    readonly balanceAfterCents: number;
    readonly saleId: string | null;
    readonly createdAt: number;
  },
): string {
  const movementId = randomUUID();
  database.sqlite
    .prepare(
      `INSERT INTO voucher_movements
       (id, voucher_id, event_id, type, amount_cents, balance_before_cents,
        balance_after_cents, sale_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      movementId,
      input.voucherId,
      input.eventId,
      input.type,
      input.amountCents,
      input.balanceBeforeCents,
      input.balanceAfterCents,
      input.saleId,
      input.createdAt,
    );
  return movementId;
}

export function getVoucherState(database: DatabaseContext): DatabaseVoucherState {
  const activeEventId = getSessionState(database).activeEvent?.id ?? null;

  if (activeEventId === null) {
    return { activeEventId: null, vouchers: [] };
  }

  const rows = database.sqlite
    .prepare(
      `SELECT
         v.id,
         v.event_id,
         v.code,
         v.origin,
         v.status,
         v.initial_balance_cents,
         v.balance_cents,
         v.table_id,
         st.name AS table_name,
         v.created_at,
         v.updated_at
       FROM vouchers v
       LEFT JOIN sale_tables st ON st.id = v.table_id
       WHERE v.event_id = ?
       ORDER BY v.created_at DESC`,
    )
    .all(activeEventId) as VoucherRow[];

  return { activeEventId, vouchers: rows.map(mapVoucher) };
}

export function createVoucher(
  database: DatabaseContext,
  input: {
    readonly code?: string;
    readonly origin: DatabaseVoucherOrigin;
    readonly initialBalanceCents: number;
    readonly tableId?: string | null;
  },
): DatabaseVoucher {
  requireProduction(database);
  const eventId = requireActiveEventId(database);

  if (!Number.isInteger(input.initialBalanceCents) || input.initialBalanceCents <= 0) {
    throw new Error('O saldo inicial do voucher deve ser positivo.');
  }

  if (input.tableId !== undefined && input.tableId !== null) {
    const table = database.sqlite
      .prepare('SELECT event_id FROM sale_tables WHERE id = ?')
      .get(input.tableId) as { readonly event_id: string } | undefined;

    if (table === undefined || table.event_id !== eventId) {
      throw new Error('A mesa informada não pertence ao evento ativo.');
    }
  }

  const code = input.code?.trim().toUpperCase() ?? generateVoucherCode();

  if (getVoucherRow(database, eventId, code) !== undefined) {
    throw new Error('Já existe um voucher com esse código no evento.');
  }

  const voucherId = randomUUID();
  const now = Date.now();

  database.sqlite.transaction(() => {
    database.sqlite
      .prepare(
        `INSERT INTO vouchers
         (id, event_id, code, origin, status, initial_balance_cents, balance_cents,
          table_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
      )
      .run(
        voucherId,
        eventId,
        code,
        input.origin,
        input.initialBalanceCents,
        input.initialBalanceCents,
        input.tableId ?? null,
        now,
        now,
      );
    recordVoucherMovement(database, {
      voucherId,
      eventId,
      type: 'issue',
      amountCents: input.initialBalanceCents,
      balanceBeforeCents: 0,
      balanceAfterCents: input.initialBalanceCents,
      saleId: null,
      createdAt: now,
    });
    appendAudit(database, {
      action: 'voucher.created',
      entityType: 'voucher',
      entityId: voucherId,
      eventId,
      details: {
        code,
        initialBalanceCents: input.initialBalanceCents,
        origin: input.origin,
        tableId: input.tableId ?? null,
      },
    });
  })();

  return getVoucherById(database, voucherId);
}

export function changeVoucherStatus(
  database: DatabaseContext,
  input: { readonly voucherId: string; readonly action: 'cancel' | 'reactivate' },
): DatabaseVoucher {
  requireProduction(database);
  const voucher = getVoucherById(database, input.voucherId);
  const activeEventId = requireActiveEventId(database);

  if (voucher.eventId !== activeEventId) {
    throw new Error('O voucher não pertence ao evento ativo.');
  }

  if (input.action === 'cancel' && voucher.status === 'cancelled') {
    return voucher;
  }

  if (input.action === 'reactivate' && voucher.status !== 'cancelled') {
    return voucher;
  }

  const nextStatus: DatabaseVoucherStatus =
    input.action === 'cancel'
      ? 'cancelled'
      : voucher.balanceCents === 0
        ? 'depleted'
        : 'active';
  const now = Date.now();

  database.sqlite.transaction(() => {
    database.sqlite
      .prepare('UPDATE vouchers SET status = ?, updated_at = ? WHERE id = ?')
      .run(nextStatus, now, voucher.id);
    recordVoucherMovement(database, {
      voucherId: voucher.id,
      eventId: voucher.eventId,
      type: input.action,
      amountCents: 0,
      balanceBeforeCents: voucher.balanceCents,
      balanceAfterCents: voucher.balanceCents,
      saleId: null,
      createdAt: now,
    });
    appendAudit(database, {
      action: input.action === 'cancel' ? 'voucher.cancelled' : 'voucher.reactivated',
      entityType: 'voucher',
      entityId: voucher.id,
      eventId: voucher.eventId,
      details: { code: voucher.code, statusAfter: nextStatus, statusBefore: voucher.status },
    });
  })();

  return getVoucherById(database, voucher.id);
}

export function redeemVoucher(
  database: DatabaseContext,
  input: {
    readonly eventId: string;
    readonly code: string;
    readonly amountCents: number;
    readonly saleId: string;
    readonly createdAt: number;
  },
): DatabaseVoucher {
  const row = getVoucherRow(database, input.eventId, input.code.trim());

  if (row === undefined) {
    throw new Error('Voucher não encontrado no evento ativo.');
  }

  const voucher = mapVoucher(row);

  if (voucher.status !== 'active') {
    throw new Error('O voucher não está ativo.');
  }

  if (voucher.balanceCents < input.amountCents) {
    throw new Error(`Saldo insuficiente no voucher. Saldo atual: ${String(voucher.balanceCents)}.`);
  }

  const nextBalance = voucher.balanceCents - input.amountCents;
  const nextStatus: DatabaseVoucherStatus = nextBalance === 0 ? 'depleted' : 'active';
  database.sqlite
    .prepare('UPDATE vouchers SET balance_cents = ?, status = ?, updated_at = ? WHERE id = ?')
    .run(nextBalance, nextStatus, input.createdAt, voucher.id);
  recordVoucherMovement(database, {
    voucherId: voucher.id,
    eventId: voucher.eventId,
    type: 'redeem',
    amountCents: input.amountCents,
    balanceBeforeCents: voucher.balanceCents,
    balanceAfterCents: nextBalance,
    saleId: input.saleId,
    createdAt: input.createdAt,
  });
  return getVoucherById(database, voucher.id);
}

export function refundVoucher(
  database: DatabaseContext,
  input: {
    readonly voucherId: string;
    readonly amountCents: number;
    readonly saleId: string;
    readonly createdAt: number;
  },
): DatabaseVoucher {
  const voucher = getVoucherById(database, input.voucherId);
  const nextBalance = voucher.balanceCents + input.amountCents;

  if (nextBalance > voucher.initialBalanceCents) {
    throw new Error('O estorno ultrapassaria o saldo inicial do voucher.');
  }

  const nextStatus: DatabaseVoucherStatus = voucher.status === 'cancelled' ? 'cancelled' : 'active';
  database.sqlite
    .prepare('UPDATE vouchers SET balance_cents = ?, status = ?, updated_at = ? WHERE id = ?')
    .run(nextBalance, nextStatus, input.createdAt, voucher.id);
  recordVoucherMovement(database, {
    voucherId: voucher.id,
    eventId: voucher.eventId,
    type: 'refund',
    amountCents: input.amountCents,
    balanceBeforeCents: voucher.balanceCents,
    balanceAfterCents: nextBalance,
    saleId: input.saleId,
    createdAt: input.createdAt,
  });
  return getVoucherById(database, voucher.id);
}
