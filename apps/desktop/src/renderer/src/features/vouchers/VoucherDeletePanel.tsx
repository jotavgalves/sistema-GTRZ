import { Trash2, TriangleAlert, X } from 'lucide-react';
import { useState } from 'react';

import type { VoucherDeleteImpact } from '@gtrz/contracts';

interface VoucherDeletePanelProps {
  readonly impact: VoucherDeleteImpact;
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onDelete: (reason: string) => Promise<void>;
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

export function VoucherDeletePanel({
  impact,
  busy,
  onCancel,
  onDelete,
}: VoucherDeletePanelProps): React.JSX.Element {
  const [reason, setReason] = useState('');

  return (
    <form
      className="voucher-delete-panel"
      onSubmit={(event) => {
        event.preventDefault();
        const normalizedReason = reason.trim();

        if (normalizedReason.length < 3) {
          return;
        }

        void onDelete(normalizedReason);
      }}
    >
      <div className="voucher-delete-panel__warning">
        <TriangleAlert size={18} aria-hidden="true" />
        <div>
          <strong>Excluir o voucher {impact.code}?</strong>
          {impact.paidOrderCount === 0 ? (
            <p>Ele ainda não foi usado em nenhuma venda paga.</p>
          ) : (
            <p>
              A exclusão cancelará {impact.paidOrderCount}{' '}
              {impact.paidOrderCount === 1 ? 'venda' : 'vendas'}, no total de{' '}
              {formatMoney(impact.paidOrderTotalCents)}. Estoque, pagamentos e{' '}
              {formatMoney(impact.voucherRedemptionCents)} consumidos do voucher serão estornados.
            </p>
          )}
        </div>
      </div>
      <label className="form-field">
        <span>Motivo da exclusão</span>
        <input
          disabled={busy}
          maxLength={240}
          onChange={(event) => {
            setReason(event.target.value);
          }}
          placeholder="Ex.: voucher criado por engano"
          value={reason}
        />
      </label>
      <div className="voucher-delete-panel__actions">
        <button
          className="button button--ghost button--compact"
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          <X size={15} aria-hidden="true" />
          Voltar
        </button>
        <button
          className="button button--danger button--compact"
          disabled={busy || reason.trim().length < 3}
          type="submit"
        >
          <Trash2 size={15} aria-hidden="true" />
          Excluir e estornar
        </button>
      </div>
    </form>
  );
}
