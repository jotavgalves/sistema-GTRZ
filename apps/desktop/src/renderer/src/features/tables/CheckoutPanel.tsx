import { CreditCard, Trash2 } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';

import type { CheckoutInput, PaymentMethod, SaleTable } from '@gtrz/contracts';

import { formatMoney, parseMoneyInput } from '../../shared/money';
import type { CartEntry } from './types';

interface CheckoutPanelProps {
  readonly cart: ReadonlyMap<string, CartEntry>;
  readonly tables: readonly SaleTable[];
  readonly busy: boolean;
  readonly onCheckout: (input: CheckoutInput) => Promise<void>;
  readonly onClear: () => void;
}

const PAYMENT_LABELS: Readonly<Record<PaymentMethod, string>> = {
  card: 'Cartão',
  pix: 'Pix',
  cash: 'Dinheiro',
  voucher: 'Voucher',
};

export function CheckoutPanel({
  cart,
  tables,
  busy,
  onCheckout,
  onClear,
}: CheckoutPanelProps): React.JSX.Element {
  const [tableId, setTableId] = useState('');
  const [mixed, setMixed] = useState(false);
  const [firstMethod, setFirstMethod] = useState<PaymentMethod>('cash');
  const [secondMethod, setSecondMethod] = useState<PaymentMethod>('pix');
  const [firstAmount, setFirstAmount] = useState('');
  const [secondAmount, setSecondAmount] = useState('');
  const [firstVoucherCode, setFirstVoucherCode] = useState('');
  const [secondVoucherCode, setSecondVoucherCode] = useState('');
  const [cashReceived, setCashReceived] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const entries = [...cart.values()];
  const totalCents = entries.reduce(
    (total, entry) => total + entry.item.salePriceCents * entry.quantity,
    0,
  );
  const openTables = tables.filter((table) => table.status === 'open');
  const usesCash = firstMethod === 'cash' || (mixed && secondMethod === 'cash');

  async function submit(formEvent: SyntheticEvent<HTMLFormElement>): Promise<void> {
    formEvent.preventDefault();
    setLocalError(null);

    try {
      if (tableId.length === 0) {
        throw new Error('Selecione a mesa ou o Balcão.');
      }

      if (entries.length === 0) {
        throw new Error('Adicione pelo menos um item ao carrinho.');
      }

      const payments = mixed
        ? [
            {
              method: firstMethod,
              amountCents: parseMoneyInput(firstAmount),
              ...(firstMethod === 'voucher' ? { voucherCode: firstVoucherCode.trim() } : {}),
            },
            {
              method: secondMethod,
              amountCents: parseMoneyInput(secondAmount),
              ...(secondMethod === 'voucher' ? { voucherCode: secondVoucherCode.trim() } : {}),
            },
          ]
        : [
            {
              method: firstMethod,
              amountCents: totalCents,
              ...(firstMethod === 'voucher' ? { voucherCode: firstVoucherCode.trim() } : {}),
            },
          ];
      const input: CheckoutInput = {
        tableId,
        lines: entries.map((entry) => ({
          itemKind: entry.item.kind,
          itemId: entry.item.id,
          quantity: entry.quantity,
        })),
        payments,
        ...(usesCash && cashReceived.trim().length > 0
          ? { cashReceivedCents: parseMoneyInput(cashReceived) }
          : {}),
      };
      await onCheckout(input);
      onClear();
      setFirstAmount('');
      setSecondAmount('');
      setCashReceived('');
      setFirstVoucherCode('');
      setSecondVoucherCode('');
    } catch (error: unknown) {
      setLocalError(error instanceof Error ? error.message : 'Não foi possível concluir a venda.');
    }
  }

  return (
    <article className="panel checkout-panel">
      <div className="panel__heading">
        <CreditCard size={20} aria-hidden="true" />
        <div>
          <h2>Carrinho e pagamento</h2>
          <p>Venda paga imediatamente; a mesa permanece aberta até o encerramento manual.</p>
        </div>
      </div>

      <div className="checkout-lines">
        {entries.length === 0 ? <p className="inventory-helper">Carrinho vazio.</p> : null}
        {entries.map((entry) => (
          <div className="checkout-line" key={`${entry.item.kind}:${entry.item.id}`}>
            <span>
              {entry.quantity}× {entry.item.name}
            </span>
            <strong>{formatMoney(entry.item.salePriceCents * entry.quantity)}</strong>
          </div>
        ))}
      </div>

      <div className="checkout-total">
        <span>Total</span>
        <strong>{formatMoney(totalCents)}</strong>
      </div>

      <form className="operation-form" onSubmit={(event) => void submit(event)}>
        <label>
          Mesa ou Balcão
          <select
            onChange={(event) => {
              setTableId(event.target.value);
            }}
            required
            value={tableId}
          >
            <option value="">Selecione</option>
            {openTables.map((table) => (
              <option key={table.id} value={table.id}>
                {table.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Forma principal
          <select
            onChange={(event) => {
              setFirstMethod(event.target.value as PaymentMethod);
            }}
            value={firstMethod}
          >
            {Object.entries(PAYMENT_LABELS).map(([method, label]) => (
              <option key={method} value={method}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {firstMethod === 'voucher' ? (
          <label>
            Código do voucher
            <input
              onChange={(event) => {
                setFirstVoucherCode(event.target.value);
              }}
              required
              value={firstVoucherCode}
            />
          </label>
        ) : null}

        <label className="checkbox-field">
          <input
            checked={mixed}
            onChange={(event) => {
              setMixed(event.target.checked);
            }}
            type="checkbox"
          />
          Pagamento misto
        </label>

        {mixed ? (
          <div className="mixed-payment-grid">
            <label>
              Valor principal
              <input
                inputMode="decimal"
                onChange={(event) => {
                  setFirstAmount(event.target.value);
                }}
                placeholder="0,00"
                required
                value={firstAmount}
              />
            </label>
            <label>
              Segunda forma
              <select
                onChange={(event) => {
                  setSecondMethod(event.target.value as PaymentMethod);
                }}
                value={secondMethod}
              >
                {Object.entries(PAYMENT_LABELS).map(([method, label]) => (
                  <option key={method} value={method}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Segundo valor
              <input
                inputMode="decimal"
                onChange={(event) => {
                  setSecondAmount(event.target.value);
                }}
                placeholder="0,00"
                required
                value={secondAmount}
              />
            </label>
            {secondMethod === 'voucher' ? (
              <label>
                Código do segundo voucher
                <input
                  onChange={(event) => {
                    setSecondVoucherCode(event.target.value);
                  }}
                  required
                  value={secondVoucherCode}
                />
              </label>
            ) : null}
          </div>
        ) : null}

        {usesCash ? (
          <label>
            Valor recebido em dinheiro
            <input
              inputMode="decimal"
              onChange={(event) => {
                setCashReceived(event.target.value);
              }}
              placeholder={formatMoney(totalCents)}
              value={cashReceived}
            />
          </label>
        ) : null}

        {localError === null ? null : <p className="form-error">{localError}</p>}

        <div className="form-actions">
          <button
            className="button button--ghost"
            disabled={busy || entries.length === 0}
            onClick={onClear}
            type="button"
          >
            <Trash2 size={16} aria-hidden="true" />
            Limpar
          </button>
          <button
            className="button button--primary"
            disabled={busy || entries.length === 0 || totalCents === 0}
            type="submit"
          >
            Concluir venda
          </button>
        </div>
      </form>
    </article>
  );
}
