import { Link2, Search, TicketCheck, Unlink } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { Voucher, VoucherAllocation } from '@gtrz/contracts';

interface VoucherCheckoutProps {
  readonly orderId: string;
  readonly servicePointId: string;
  readonly allocation: VoucherAllocation | null;
  readonly busy: boolean;
  readonly value: string;
  readonly valueCents: number;
  readonly invalid: boolean;
  readonly onValueChange: (value: string) => void;
  readonly onBind: (code: string) => Promise<void>;
  readonly onUnbind: () => Promise<void>;
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

export function VoucherCheckout({
  orderId,
  servicePointId,
  allocation,
  busy,
  value,
  valueCents,
  invalid,
  onValueChange,
  onBind,
  onUnbind,
}: VoucherCheckoutProps): React.JSX.Element {
  const [availableVouchers, setAvailableVouchers] = useState<readonly Voucher[]>([]);
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    let active = true;

    void window.gtrz.vouchers
      .getState()
      .then((voucherState) => {
        if (active) {
          setAvailableVouchers(
            voucherState.vouchers.filter(
              (voucher) =>
                voucher.status === 'active' &&
                voucher.remainingBalanceCents > 0 &&
                voucher.servicePointId === servicePointId,
            ),
          );
        }
      })
      .catch(() => {
        if (active) {
          setAvailableVouchers([]);
        }
      });

    return () => {
      active = false;
    };
  }, [orderId, servicePointId, allocation?.voucherId]);

  const automaticSelection =
    allocation?.servicePointId === servicePointId ? allocation.code : '';

  return (
    <section className="voucher-checkout" aria-label="Voucher da comanda">
      <div className="voucher-checkout__heading">
        <TicketCheck size={18} aria-hidden="true" />
        <div>
          <strong>Voucher da mesa</strong>
          <small>
            A lista exibe somente vouchers criados para esta mesa. Qualquer outro voucher exige o
            código manual.
          </small>
        </div>
      </div>

      <div className="voucher-checkout__selector">
        <select
          aria-label="Voucher automático da mesa"
          disabled={busy}
          onChange={(event) => {
            const code = event.target.value;

            if (code.length === 0) {
              void onUnbind().catch(() => undefined);
            } else {
              void onBind(code).catch(() => undefined);
            }
          }}
          value={automaticSelection}
        >
          <option value="">Nenhum voucher automático</option>
          {availableVouchers.map((voucher) => (
            <option key={voucher.id} value={voucher.code}>
              {voucher.code} · {voucher.label} · {formatMoney(voucher.remainingBalanceCents)}
            </option>
          ))}
        </select>
        {allocation === null ? <Link2 size={18} aria-hidden="true" /> : null}
        {allocation !== null ? (
          <button
            aria-label="Remover voucher da comanda"
            className="icon-button"
            disabled={busy}
            onClick={() => {
              void onUnbind().catch(() => undefined);
            }}
            title="Remover voucher"
            type="button"
          >
            <Unlink size={17} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <form
        className="voucher-checkout__manual"
        onSubmit={(event) => {
          event.preventDefault();
          const code = manualCode.trim();

          if (code.length < 4) {
            return;
          }

          void onBind(code)
            .then(() => {
              setManualCode('');
            })
            .catch(() => undefined);
        }}
      >
        <label className="form-field">
          <span>Aplicar outro voucher pelo código</span>
          <input
            disabled={busy}
            maxLength={32}
            onChange={(event) => {
              setManualCode(event.target.value.toLocaleUpperCase('pt-BR'));
            }}
            placeholder="Digite ou leia o código"
            value={manualCode}
          />
        </label>
        <button
          className="button button--secondary button--compact"
          disabled={busy || manualCode.trim().length < 4}
          type="submit"
        >
          <Search size={15} aria-hidden="true" />
          Aplicar código
        </button>
      </form>

      {allocation === null ? (
        <p className="voucher-checkout__empty">Nenhum voucher aplicado nesta compra.</p>
      ) : (
        <div className="voucher-checkout__card">
          <span>
            <strong>{allocation.label}</strong>
            <small>
              {allocation.code} ·{' '}
              {allocation.servicePointId === servicePointId
                ? 'vinculado a esta mesa'
                : 'aplicado manualmente'}
            </small>
          </span>
          <span>
            <small>Saldo disponível</small>
            <strong>{formatMoney(allocation.remainingBalanceCents)}</strong>
          </span>
          <label className="form-field">
            <span>Valor a utilizar</span>
            <input
              aria-invalid={invalid}
              disabled={busy}
              inputMode="decimal"
              onChange={(event) => {
                onValueChange(event.target.value);
              }}
              placeholder="0,00"
              value={value}
            />
          </label>
        </div>
      )}

      {allocation !== null && valueCents > allocation.remainingBalanceCents ? (
        <p className="form-error">
          O voucher possui somente {formatMoney(allocation.remainingBalanceCents)} disponíveis.
        </p>
      ) : null}
    </section>
  );
}
