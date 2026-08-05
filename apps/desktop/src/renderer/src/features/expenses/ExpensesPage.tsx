import { ReceiptText, RefreshCw } from 'lucide-react';

import { formatMoney } from '../../shared/money';
import { ExpenseCard } from './ExpenseCard';
import { ExpenseForms } from './ExpenseForms';
import { useExpenses } from './useExpenses';

export function ExpensesPage(): React.JSX.Element {
  const {
    state,
    loading,
    busy,
    error,
    message,
    reload,
    createCategory,
    createExpense,
    pay,
    reversePayment,
  } = useExpenses();
  const categories = state?.categories ?? [];
  const expenses = state?.expenses ?? [];
  const paidCents = expenses.reduce((total, expense) => total + expense.paidCents, 0);
  const outstandingCents = expenses.reduce(
    (total, expense) => total + expense.outstandingCents,
    0,
  );

  return (
    <section className="feature-page">
      <header className="feature-header">
        <div>
          <span className="eyebrow">Compromissos e pagamentos realizados</span>
          <h1>Despesas</h1>
          <p>Controle valores abertos, parciais e pagos, com estorno individual de parcelas.</p>
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

      <div className="summary-grid summary-grid--compact">
        <article className="summary-card summary-card--accent">
          <span>Total comprometido</span>
          <strong>{formatMoney(paidCents + outstandingCents)}</strong>
        </article>
        <article className="summary-card">
          <span>Pago</span>
          <strong>{formatMoney(paidCents)}</strong>
        </article>
        <article className="summary-card">
          <span>Em aberto</span>
          <strong>{formatMoney(outstandingCents)}</strong>
        </article>
        <article className="summary-card">
          <span>Parciais</span>
          <strong>{expenses.filter((expense) => expense.status === 'partial').length}</strong>
        </article>
      </div>

      {state?.activeEventId === null || state === null ? (
        <div className="inventory-warning">
          <ReceiptText size={19} aria-hidden="true" />
          <span>Selecione um evento aberto para administrar despesas.</span>
        </div>
      ) : null}
      {error === null ? null : <p className="form-error">{error}</p>}
      {message === null ? null : <p className="form-success">{message}</p>}

      {state?.activeEventId !== null && state !== null ? (
        <ExpenseForms
          busy={busy}
          categories={categories}
          onCreateCategory={createCategory}
          onCreateExpense={createExpense}
        />
      ) : null}

      <div className="expense-grid">
        {loading ? <div className="route-state">Carregando despesas…</div> : null}
        {!loading && expenses.length === 0 ? (
          <div className="empty-state">
            <ReceiptText size={32} aria-hidden="true" />
            <h2>Nenhuma despesa registrada</h2>
            <p>Crie uma categoria e registre o primeiro compromisso.</p>
          </div>
        ) : null}
        {expenses.map((expense) => (
          <ExpenseCard
            busy={busy}
            expense={expense}
            key={expense.id}
            onPay={pay}
            onReversePayment={reversePayment}
          />
        ))}
      </div>
    </section>
  );
}
