import { Ban, RotateCcw } from 'lucide-react';

import type { ChangeVoucherStatusInput, Voucher } from '@gtrz/contracts';

import { formatMoney } from '../../shared/money';

interface VoucherCardProps {
  readonly voucher: Voucher;
  readonly busy: boolean;
  readonly onChangeStatus: (input: ChangeVoucherStatusInput) => Promise<void>;
}

const ORIGIN_LABELS = {
  'pre-sale': 'Pré-venda',
  'local-sale': 'Venda local',
  courtesy: 'Cortesia',
} as const;

export function VoucherCard({
  voucher,
  busy,
  onChangeStatus,
}: VoucherCardProps): React.JSX.Element {
  return (
    <article className="voucher-card">
      <div className="voucher-card__header">
        <div>
          <span>{ORIGIN_LABELS[voucher.origin]}</span>
          <h3>{voucher.code}</h3>
        </div>
        <span className={`status-badge status-badge--${voucher.status}`}>
          {voucher.status === 'active'
            ? 'Ativo'
            : voucher.status === 'depleted'
              ? 'Esgotado'
              : 'Cancelado'}
        </span>
      </div>
      <div className="voucher-balance">
        <span>Saldo disponível</span>
        <strong>{formatMoney(voucher.balanceCents)}</strong>
        <small>Emitido com {formatMoney(voucher.initialBalanceCents)}</small>
      </div>
      {voucher.tableName === null ? null : <p>Vinculado a {voucher.tableName}</p>}
      <button
        className={
          voucher.status === 'cancelled'
            ? 'button button--secondary button--compact'
            : 'button button--danger button--compact'
        }
        disabled={busy}
        onClick={() => {
          void onChangeStatus({
            voucherId: voucher.id,
            action: voucher.status === 'cancelled' ? 'reactivate' : 'cancel',
          });
        }}
        type="button"
      >
        {voucher.status === 'cancelled' ? (
          <>
            <RotateCcw size={15} aria-hidden="true" />
            Reativar
          </>
        ) : (
          <>
            <Ban size={15} aria-hidden="true" />
            Cancelar
          </>
        )}
      </button>
    </article>
  );
}
