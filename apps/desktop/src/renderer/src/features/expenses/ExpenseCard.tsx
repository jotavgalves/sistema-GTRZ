import { RotateCcw, Wallet } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';

import type {
  Expense,
  ExpensePaymentMethod,
  PayExpenseInput,
  ReverseExpensePaymentInput,
} from '@gtrz/contracts';

import { formatMoney, parseMoneyInput } from '../../shared/money';

interface ExpenseCardProps {
  readonly expense: Expense;
  readonly busy: boolean;
  readonly onPay: (input: PayExpenseInput) => Promise<void>;
  readonly onReversePayment: (input: ReverseExpensePaymentInput) => Promise<void>;
}

export function ExpenseCard({
  expense,
  busy,
  onPay,
  onReversePayment,
}: ExpenseCardProps): React.JSX.Element {
  const [method, setMethod] = useState<ExpensePaymentMethod>('pix');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  async function submitPayment(formEvent: SyntheticEvent<HTMLFormElement>): Promise<void> {
    formEvent.preventDefault();
    setLocalError(null);

    try {
      await onPay({
        expenseId: expense.id,
        method,
        amountCents: parseMoneyInput(amount),
        ...(note.trim().length > 0 ? { note: note.trim() } : {}),
      });
      setAmount('');
      setNote('');
    } catch (error: unknown) {
      setLocalError(error instanceof Error ? error.message : 'Não foi possível pagar a despesa.');
    }
  }

  return (
    <article className="expense-card">
      <div className="expense-card__header">
        <div>
          <span>{expense.categoryName}</span>
          <h3>{expense.description}</h3>
        </div>
        <span className={`status-badge status-badge--${expense.status}`}>
          {expense.status === 'paid' ? 'Paga' : expense.status === 'partial' ? 'Parcial' : 'Aberta'}
        </span>
      </div>

      <dl className="expense-totals">
        <div>
          <dt>Total</dt>
          <dd>{formatMoney(expense.totalCents)}</dd>
        </div>
        <div>
          <dt>Pago</dt>
          <dd>{formatMoney(expense.paidCents)}</dd>
        </div>
        <div>
          <dt>Em aberto</dt>
          <dd>{formatMoney(expense.outstandingCents)}</dd>
        </div>
      </dl>

      {expense.status !== 'paid' ? (
        <form className="expense-payment-form" onSubmit={(event) => void submitPayment(event)}>
          <label>
            Forma
            <select
              onChange={(event) => {
                setMethod(event.target.value as ExpensePaymentMethod);
              }}
              value={method}
            >
              <option value="pix">Pix</option>
              <option value="card">Cartão</option>
              <option value="cash">Dinheiro</option>
            </select>
          </label>
          <label>
            Valor
            <input
              inputMode="decimal"
              onChange={(event) => {
                setAmount(event.target.value);
              }}
              placeholder={formatMoney(expense.outstandingCents)}
              required
              value={amount}
            />
          </label>
          <label>
            Observação opcional
            <input
              onChange={(event) => {
                setNote(event.target.value);
              }}
              value={note}
            />
          </label>
          <button className="button button--primary button--compact" disabled={busy} type="submit">
            <Wallet size={15} aria-hidden="true" />
            Registrar pagamento
          </button>
        </form>
      ) : null}

      {localError === null ? null : <p className="form-error">{localError}</p>}

      <div className="expense-payment-list">
        {expense.payments.map((payment) => (
          <div className={payment.reversedAt === null ? '' : 'expense-payment--reversed'} key={payment.id}>
            <span>
              {payment.method === 'cash' ? 'Dinheiro' : payment.method === 'card' ? 'Cartão' : 'Pix'} ·{' '}
              {formatMoney(payment.amountCents)}
            </span>
            {payment.reversedAt === null ? (
              <button
                aria-label="Estornar pagamento"
                className="icon-button"
                disabled={busy}
                onClick={() => {
                  void onReversePayment({ paymentId: payment.id });
                }}
                type="button"
              >
                <RotateCcw size={15} aria-hidden="true" />
              </button>
            ) : (
              <small>Estornado</small>
            )}
          </div>
        ))}
      </div>
    </article>
  );
}
