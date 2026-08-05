import { CreditCard, RefreshCw } from 'lucide-react';

import { formatMoney } from '../../shared/money';
import { CashControls } from './CashControls';
import { useCash } from './useCash';

export function CashPage(): React.JSX.Element {
  const { summary, loading, busy, error, message, reload, open, close, addMovement } = useCash();

  return (
    <section className="feature-page">
      <header className="feature-header">
        <div>
          <span className="eyebrow">Fluxo realizado e faturamento separados</span>
          <h1>Caixa administrativo</h1>
          <p>Concilie vendas, vouchers, despesas, suprimentos, sangrias e reembolsos.</p>
        </div>
        <button
          className="button button--secondary"
          disabled={loading}
          onClick={() => {
            void reload();
          }}
          type="button"
        >
          <RefreshCw size={17} aria-hidden="true" />
          Atualizar
        </button>
      </header>

      {summary === null ? null : (
        <>
          <div className="summary-grid summary-grid--compact">
            <article className="summary-card summary-card--accent">
              <span>Faturamento comercial</span>
              <strong>{formatMoney(summary.commercialRevenueCents)}</strong>
            </article>
            <article className="summary-card">
              <span>Entradas realizadas</span>
              <strong>{formatMoney(summary.actualInflowCents)}</strong>
            </article>
            <article className="summary-card">
              <span>Vouchers resgatados</span>
              <strong>{formatMoney(summary.voucherRedemptionCents)}</strong>
            </article>
            <article className="summary-card">
              <span>Dinheiro esperado</span>
              <strong>{formatMoney(summary.expectedCashCents)}</strong>
            </article>
          </div>

          <div className="cash-breakdown-grid">
            <article className="cash-breakdown-card">
              <span>Dinheiro</span>
              <strong>{formatMoney(summary.cashSalesCents)}</strong>
            </article>
            <article className="cash-breakdown-card">
              <span>Pix</span>
              <strong>{formatMoney(summary.pixSalesCents)}</strong>
            </article>
            <article className="cash-breakdown-card">
              <span>Cartão</span>
              <strong>{formatMoney(summary.cardSalesCents)}</strong>
            </article>
            <article className="cash-breakdown-card">
              <span>Despesas pagas</span>
              <strong>{formatMoney(summary.expensesPaidCents)}</strong>
            </article>
            <article className="cash-breakdown-card">
              <span>Suprimentos</span>
              <strong>{formatMoney(summary.suppliesCents)}</strong>
            </article>
            <article className="cash-breakdown-card">
              <span>Sangrias</span>
              <strong>{formatMoney(summary.withdrawalsCents)}</strong>
            </article>
            <article className="cash-breakdown-card">
              <span>Reembolsos</span>
              <strong>{formatMoney(summary.refundsCents)}</strong>
            </article>
            <article className="cash-breakdown-card">
              <span>Status</span>
              <strong>
                {summary.session === null
                  ? 'Não iniciado'
                  : summary.session.status === 'open'
                    ? 'Aberto'
                    : 'Fechado'}
              </strong>
            </article>
          </div>

          <CashControls
            busy={busy}
            onAddMovement={addMovement}
            onClose={close}
            onOpen={open}
            summary={summary}
          />
        </>
      )}

      {loading ? <div className="route-state">Carregando caixa…</div> : null}
      {summary === null && !loading ? (
        <div className="inventory-warning">
          <CreditCard size={19} aria-hidden="true" />
          <span>Selecione um evento aberto para consultar o caixa.</span>
        </div>
      ) : null}
      {error === null ? null : <p className="form-error">{error}</p>}
      {message === null ? null : <p className="form-success">{message}</p>}
    </section>
  );
}
