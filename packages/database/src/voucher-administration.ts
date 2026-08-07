import { randomBytes, randomUUID } from 'node:crypto';

import { appendAudit } from './audit';
import { getSessionState } from './control';
import type { DatabaseContext } from './types';
import type {
  DatabaseVoucher,
  DatabaseVoucherStatus,
  DatabaseVoucherTransaction,
} from './vouchers';

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

function requireProduction(database: DatabaseContext): void {
  if (getSessionState(database).profile !== 'production') {
    throw new Error('A administração de vouchers exige o perfil Produção.');
  }
}

function requireActiveEvent(database: DatabaseContext): string {
  const eventId = getSessionState(database).activeEvent?.id;

  if (eventId === undefined) {
    throw new Error('Selecione um evento aberto antes de administrar vouchers.');
  }

  return eventId;
}

function normalizeCode(code: string): string {
  return code.trim().toLocaleUpperCase('pt-BR').replaceAll(/\s+/gu, '-');
}

function generateCode(): string {
  return `GTRZ-${randomBytes(4).toString('hex').toLocaleUpperCase('pt-BR')}`;
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

function requireVoucherById(database: DatabaseContext, voucherId: string): VoucherRow {
  const row = database.sqlite.prepare(selectVoucherSql('v.id = ?')).get(voucherId) as
    | VoucherRow
    | undefined;

  if (row?.deleted_at !== null) {
    throw new Error('O voucher informado não existe ou foi excluído.');
  }

  return row;
}

function validateServicePoint(
  database: DatabaseContext,
  eventId: string,
  servicePointId: string | null | undefined,
): string | null {
  if (servicePointId === undefined || servicePointId === null) {
    return null;
  }

  const servicePoint = database.sqlite
    .prepare(
      `SELECT id
       FROM service_points
       WHERE id = ? AND event_id = ? AND type = 'table' AND active = 1`,
    )
    .get(servicePointId, eventId);

  if (servicePoint === undefined) {
    throw new Error('A mesa selecionada não existe ou não pertence ao evento ativo.');
  }

  return servicePointId;
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

export function createVoucher(
  database: DatabaseContext,
  input: {
    readonly code?: string;
    readonly label: string;
    readonly initialBalanceCents: number;
    readonly servicePointId?: string | null;
  },
): DatabaseVoucher {
  requireProduction(database);
  const eventId = requireActiveEvent(database);
  const code = normalizeCode(input.code ?? generateCode());
  const label = input.label.trim();
  const servicePointId = validateServicePoint(database, eventId, input.servicePointId);
  const duplicate = database.sqlite
    .prepare('SELECT id FROM vouchers WHERE event_id = ? AND code = ? COLLATE NOCASE')
    .get(eventId, code);

  if (duplicate !== undefined) {
    throw new Error('Já existe ou já existiu um voucher com esse código no evento.');
  }

  if (!Number.isInteger(input.initialBalanceCents) || input.initialBalanceCents <= 0) {
    throw new Error('O saldo inicial do voucher deve ser positivo.');
  }

  const voucherId = randomUUID();
  const now = Date.now();
  database.sqlite.transaction(() => {
    database.sqlite
      .prepare(
        `INSERT INTO vouchers
         (id, event_id, code, label, initial_balance_cents, remaining_balance_cents,
          status, service_point_id, deleted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, NULL, ?, ?)`,
      )
      .run(
        voucherId,
        eventId,
        code,
        label,
        input.initialBalanceCents,
        input.initialBalanceCents,
        servicePointId,
        now,
        now,
      );
    insertTransaction(database, {
      eventId,
      voucherId,
      voucherCode: code,
      orderId: null,
      type: 'issue',
      amountCents: input.initialBalanceCents,
      balanceBeforeCents: 0,
      balanceAfterCents: input.initialBalanceCents,
      note: label,
      createdAt: now,
    });
    appendAudit(database, {
      action: 'voucher.created',
      entityType: 'voucher',
      entityId: voucherId,
      eventId,
      details: {
        after: {
          code,
          initialBalanceCents: input.initialBalanceCents,
          label,
          servicePointId,
        },
      },
    });
  })();

  return mapVoucher(requireVoucherById(database, voucherId));
}

export function updateVoucher(
  database: DatabaseContext,
  input: {
    readonly voucherId: string;
    readonly code: string;
    readonly label: string;
    readonly servicePointId: string | null;
    readonly addBalanceCents: number;
  },
): DatabaseVoucher {
  requireProduction(database);
  const eventId = requireActiveEvent(database);
  const voucher = requireVoucherById(database, input.voucherId);

  if (voucher.event_id !== eventId) {
    throw new Error('O voucher não pertence ao evento ativo.');
  }

  if (!Number.isInteger(input.addBalanceCents) || input.addBalanceCents < 0) {
    throw new Error('O acréscimo do voucher não pode ser negativo.');
  }

  const code = normalizeCode(input.code);
  const label = input.label.trim();
  const servicePointId = validateServicePoint(database, eventId, input.servicePointId);
  const duplicate = database.sqlite
    .prepare(
      `SELECT id FROM vouchers
       WHERE event_id = ? AND code = ? COLLATE NOCASE AND id != ?`,
    )
    .get(eventId, code, voucher.id);

  if (duplicate !== undefined) {
    throw new Error('Já existe ou já existiu outro voucher com esse código no evento.');
  }

  const nextInitialBalance = voucher.initial_balance_cents + input.addBalanceCents;
  const nextRemainingBalance = voucher.remaining_balance_cents + input.addBalanceCents;
  const nextStatus: DatabaseVoucherStatus =
    voucher.status === 'exhausted' && input.addBalanceCents > 0 ? 'active' : voucher.status;
  const now = Date.now();

  database.sqlite.transaction(() => {
    database.sqlite
      .prepare(
        `UPDATE vouchers
         SET code = ?, label = ?, initial_balance_cents = ?, remaining_balance_cents = ?,
             status = ?, service_point_id = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        code,
        label,
        nextInitialBalance,
        nextRemainingBalance,
        nextStatus,
        servicePointId,
        now,
        voucher.id,
      );

    if (input.addBalanceCents > 0) {
      insertTransaction(database, {
        eventId,
        voucherId: voucher.id,
        voucherCode: code,
        orderId: null,
        type: 'issue',
        amountCents: input.addBalanceCents,
        balanceBeforeCents: voucher.remaining_balance_cents,
        balanceAfterCents: nextRemainingBalance,
        note: 'Acréscimo de saldo',
        createdAt: now,
      });
    }

    appendAudit(database, {
      action: 'voucher.updated',
      entityType: 'voucher',
      entityId: voucher.id,
      eventId,
      details: {
        before: {
          code: voucher.code,
          initialBalanceCents: voucher.initial_balance_cents,
          label: voucher.label,
          remainingBalanceCents: voucher.remaining_balance_cents,
          servicePointId: voucher.service_point_id,
          status: voucher.status,
        },
        after: {
          addBalanceCents: input.addBalanceCents,
          code,
          initialBalanceCents: nextInitialBalance,
          label,
          remainingBalanceCents: nextRemainingBalance,
          servicePointId,
          status: nextStatus,
        },
      },
    });
  })();

  return mapVoucher(requireVoucherById(database, voucher.id));
}

export function changeVoucherStatus(
  database: DatabaseContext,
  input: { readonly voucherId: string; readonly status: 'active' | 'cancelled' },
): DatabaseVoucher {
  requireProduction(database);
  const eventId = requireActiveEvent(database);
  const voucher = requireVoucherById(database, input.voucherId);

  if (voucher.event_id !== eventId) {
    throw new Error('O voucher não pertence ao evento ativo.');
  }

  if (input.status === 'active' && voucher.remaining_balance_cents === 0) {
    throw new Error('Um voucher sem saldo não pode ser reativado.');
  }

  if (voucher.status === input.status) {
    return mapVoucher(voucher);
  }

  const now = Date.now();
  database.sqlite.transaction(() => {
    database.sqlite
      .prepare('UPDATE vouchers SET status = ?, updated_at = ? WHERE id = ?')
      .run(input.status, now, voucher.id);
    insertTransaction(database, {
      eventId,
      voucherId: voucher.id,
      voucherCode: voucher.code,
      orderId: null,
      type: input.status === 'active' ? 'reactivation' : 'cancellation',
      amountCents: 0,
      balanceBeforeCents: voucher.remaining_balance_cents,
      balanceAfterCents: voucher.remaining_balance_cents,
      note: null,
      createdAt: now,
    });
    appendAudit(database, {
      action: `voucher.${input.status}`,
      entityType: 'voucher',
      entityId: voucher.id,
      eventId,
      details: {
        before: { status: voucher.status },
        after: { status: input.status },
        code: voucher.code,
      },
    });
  })();

  return mapVoucher(requireVoucherById(database, voucher.id));
}
