import { Ban, History } from 'lucide-react';

import type { CancelSaleInput, Sale } from '@gtrz/contracts';

import { formatMoney } from '../../shared/money';

interface SalesHistoryProps {
  readonly sales: readonly Sale[];
  readonly production: boolean;
  readonly busy: boolean;
  readonly onCancel: (input: CancelSaleInput) => Promise<void>;
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(timestamp);
}

export function SalesHistory({
  sales,
  production,
  busy,
  onCancel,
}: SalesHistoryProps): React.JSX.Element {
  return (
    <article className="panel sales-history-panel">
      <div className="panel__heading">
        <History size={20} aria-hidden="true" />
        <div>
          <h2>Vendas recentes</h2>
          <p>Cancelamentos preservam o histórico e devolvem estoque e pagamentos.</p>
        </div>
      </div>

      <div className="sales-history-list">
        {sales.length === 0 ? <p className="inventory-helper">Nenhuma venda concluída.</p> : null}
        {sales.map((sale) => (
          <article className="sale-history-card" key={sale.id}>
            <div className="sale-history-card__header">
              <div>
                <span>{formatDate(sale.createdAt)}</span>
                <h3>{sale.tableName}</h3>
              </div>
              <div>
                <strong>{formatMoney(sale.totalCents)}</strong>
                <span className={`status-badge status-badge--${sale.status}`}>
                  {sale.status === 'paid' ? 'Paga' : 'Cancelada'}
                </span>
              </div>
            </div>
            <ul>
              {sale.lines.map((line) => (
                <li key={line.id}>
                  <span>
                    {line.quantity}× {line.itemName}
                  </span>
                  <strong>{formatMoney(line.totalPriceCents)}</strong>
                </li>
              ))}
            </ul>
            <div className="sale-payment-list">
              {sale.payments.map((payment) => (
                <span key={payment.id}>
                  {payment.method === 'card'
                    ? 'Cartão'
                    : payment.method === 'cash'
                      ? 'Dinheiro'
                      : payment.method === 'pix'
                        ? 'Pix'
                        : `Voucher ${payment.voucherCode ?? ''}`}{' '}
                  · {formatMoney(payment.amountCents)}
                </span>
              ))}
              {sale.changeCents > 0 ? <span>Troco · {formatMoney(sale.changeCents)}</span> : null}
            </div>
            {production && sale.status === 'paid' ? (
              <button
                className="button button--danger button--compact"
                disabled={busy}
                onClick={() => {
                  const reason = window.prompt('Motivo do cancelamento:')?.trim();

                  if (reason !== undefined && reason.length >= 3) {
                    void onCancel({ saleId: sale.id, reason });
                  }
                }}
                type="button"
              >
                <Ban size={15} aria-hidden="true" />
                Cancelar e estornar
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </article>
  );
}
