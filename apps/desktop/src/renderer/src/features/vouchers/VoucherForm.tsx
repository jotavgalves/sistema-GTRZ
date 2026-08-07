import { TicketPlus } from 'lucide-react';
import { useState } from 'react';

import type { CreateVoucherInput, ServicePoint } from '@gtrz/contracts';

interface VoucherFormProps {
  readonly busy: boolean;
  readonly tables: readonly ServicePoint[];
  readonly onSubmit: (input: CreateVoucherInput) => Promise<void>;
}

function parseMoney(value: string): number {
  const trimmed = value.trim().replaceAll(/\s/gu, '');
  const normalized = trimmed.includes(',')
    ? trimmed.replaceAll('.', '').replace(',', '.')
    : trimmed;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

export function VoucherForm({ busy, tables, onSubmit }: VoucherFormProps): React.JSX.Element {
  const [label, setLabel] = useState('');
  const [code, setCode] = useState('');
  const [balance, setBalance] = useState('');
  const [servicePointId, setServicePointId] = useState('');

  return (
    <form
      className="voucher-form"
      onSubmit={(event) => {
        event.preventDefault();
        const normalizedCode = code.trim();
        const initialBalanceCents = parseMoney(balance);
        const baseInput = {
          label: label.trim(),
          initialBalanceCents,
          servicePointId: servicePointId.length === 0 ? null : servicePointId,
        };
        const input: CreateVoucherInput =
          normalizedCode.length === 0 ? baseInput : { ...baseInput, code: normalizedCode };

        void onSubmit(input)
          .then(() => {
            setLabel('');
            setCode('');
            setBalance('');
            setServicePointId('');
          })
          .catch(() => undefined);
      }}
    >
      <div className="panel__heading">
        <TicketPlus size={20} aria-hidden="true" />
        <div>
          <h2>Emitir voucher</h2>
          <p>Vincule a uma mesa para fazê-lo aparecer automaticamente apenas nela.</p>
        </div>
      </div>
      <label className="form-field">
        <span>Identificação</span>
        <input
          disabled={busy}
          maxLength={100}
          onChange={(event) => {
            setLabel(event.target.value);
          }}
          placeholder="Ex.: Crédito patrocinador"
          required
          value={label}
        />
      </label>
      <label className="form-field">
        <span>Código opcional</span>
        <input
          disabled={busy}
          maxLength={32}
          onChange={(event) => {
            setCode(event.target.value.toLocaleUpperCase('pt-BR'));
          }}
          placeholder="Gerado automaticamente"
          value={code}
        />
      </label>
      <label className="form-field">
        <span>Saldo inicial</span>
        <input
          disabled={busy}
          inputMode="decimal"
          onChange={(event) => {
            setBalance(event.target.value);
          }}
          placeholder="100,00"
          required
          value={balance}
        />
      </label>
      <label className="form-field">
        <span>Mesa vinculada</span>
        <select
          disabled={busy}
          onChange={(event) => {
            setServicePointId(event.target.value);
          }}
          value={servicePointId}
        >
          <option value="">Sem vínculo automático</option>
          {tables.map((table) => (
            <option key={table.id} value={table.id}>
              {table.label}
            </option>
          ))}
        </select>
        <small>Sem vínculo, o voucher só será aplicado digitando o código no checkout.</small>
      </label>
      <button
        className="button"
        disabled={busy || label.trim().length < 2 || parseMoney(balance) <= 0}
        type="submit"
      >
        Emitir voucher
      </button>
    </form>
  );
}
