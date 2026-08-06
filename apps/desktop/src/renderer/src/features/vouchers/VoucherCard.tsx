import { Ban, CheckCircle2, Copy, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';

import type {
  ServicePoint,
  UpdateVoucherInput,
  Voucher,
  VoucherDeleteImpact,
} from '@gtrz/contracts';

import { VoucherDeletePanel } from './VoucherDeletePanel';
import { VoucherEditForm } from './VoucherEditForm';

interface VoucherCardProps {
  readonly voucher: Voucher;
  readonly tables: readonly ServicePoint[];
  readonly busy: boolean;
  readonly onUpdate: (input: UpdateVoucherInput) => Promise<void>;
  readonly onChangeStatus: (voucherId: string, status: 'active' | 'cancelled') => Promise<void>;
  readonly onPreviewDeletion: (voucherId: string) => Promise<VoucherDeleteImpact>;
  readonly onDelete: (voucherId: string, reason: string) => Promise<void>;
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

const STATUS_LABELS = {
  active: 'Ativo',
  exhausted: 'Esgotado',
  cancelled: 'Cancelado',
} as const;

export function VoucherCard({
  voucher,
  tables,
  busy,
  onUpdate,
  onChangeStatus,
  onPreviewDeletion,
  onDelete,
}: VoucherCardProps): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [deleteImpact, setDeleteImpact] = useState<VoucherDeleteImpact | null>(null);

  return (
    <article className="voucher-card">
      <header className="voucher-card__header">
        <span>
          <strong>{voucher.label}</strong>
          <code>{voucher.code}</code>
          <small>
            {voucher.servicePointLabel === null
              ? 'Somente por código manual'
              : `Aparece automaticamente em ${voucher.servicePointLabel}`}
          </small>
        </span>
        <span
          className={
            voucher.status === 'active'
              ? 'status-badge status-badge--open'
              : 'status-badge status-badge--archived'
          }
        >
          {STATUS_LABELS[voucher.status]}
        </span>
      </header>

      <div className="voucher-card__balance">
        <span>Saldo disponível</span>
        <strong>{formatMoney(voucher.remainingBalanceCents)}</strong>
        <small>Valor total acumulado: {formatMoney(voucher.initialBalanceCents)}</small>
      </div>

      {editing ? (
        <VoucherEditForm
          busy={busy}
          onCancel={() => {
            setEditing(false);
          }}
          onSubmit={onUpdate}
          tables={tables}
          voucher={voucher}
        />
      ) : null}

      {deleteImpact === null ? null : (
        <VoucherDeletePanel
          busy={busy}
          impact={deleteImpact}
          onCancel={() => {
            setDeleteImpact(null);
          }}
          onDelete={(reason) => onDelete(voucher.id, reason)}
        />
      )}

      {!editing && deleteImpact === null ? (
        <div className="voucher-card__actions">
          <button
            className="button button--ghost button--compact"
            disabled={busy}
            onClick={() => {
              void navigator.clipboard.writeText(voucher.code);
            }}
            type="button"
          >
            <Copy size={15} aria-hidden="true" />
            Copiar código
          </button>
          <button
            className="button button--ghost button--compact"
            disabled={busy}
            onClick={() => {
              setEditing(true);
            }}
            type="button"
          >
            <Pencil size={15} aria-hidden="true" />
            Editar
          </button>
          {voucher.status === 'active' ? (
            <button
              className="button button--ghost button--compact"
              disabled={busy}
              onClick={() => {
                void onChangeStatus(voucher.id, 'cancelled');
              }}
              type="button"
            >
              <Ban size={15} aria-hidden="true" />
              Cancelar
            </button>
          ) : null}
          {voucher.status === 'cancelled' && voucher.remainingBalanceCents > 0 ? (
            <button
              className="button button--secondary button--compact"
              disabled={busy}
              onClick={() => {
                void onChangeStatus(voucher.id, 'active');
              }}
              type="button"
            >
              <RefreshCw size={15} aria-hidden="true" />
              Reativar
            </button>
          ) : null}
          {voucher.status === 'exhausted' ? (
            <span className="voucher-card__complete">
              <CheckCircle2 size={15} aria-hidden="true" />
              Saldo consumido
            </span>
          ) : null}
          <button
            className="button button--danger button--compact"
            disabled={busy}
            onClick={() => {
              void onPreviewDeletion(voucher.id)
                .then(setDeleteImpact)
                .catch(() => undefined);
            }}
            type="button"
          >
            <Trash2 size={15} aria-hidden="true" />
            Excluir
          </button>
        </div>
      ) : null}
    </article>
  );
}
