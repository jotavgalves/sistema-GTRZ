import { Save, X } from 'lucide-react';
import { useState } from 'react';

import type { ServicePoint, UpdateVoucherInput, Voucher } from '@gtrz/contracts';

interface VoucherEditFormProps {
  readonly voucher: Voucher;
  readonly tables: readonly ServicePoint[];
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (input: UpdateVoucherInput) => Promise<void>;
}

function parseMoney(value: string): number {
  const trimmed = value.trim().replaceAll(/\s/gu, '');
  const normalized = trimmed.includes(',')
    ? trimmed.replaceAll('.', '').replace(',', '.')
    : trimmed;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

export function VoucherEditForm({
  voucher,
  tables,
  busy,
  onCancel,
  onSubmit,
}: VoucherEditFormProps): React.JSX.Element {
  const [label, setLabel] = useState(voucher.label);
  const [code, setCode] = useState(voucher.code);
  const [servicePointId, setServicePointId] = useState(voucher.servicePointId ?? '');
  const [addBalance, setAddBalance] = useState('');
  const addBalanceCents = parseMoney(addBalance);

  return (
    <form
      className="voucher-edit-form"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({
          voucherId: voucher.id,
          code: code.trim(),
          label: label.trim(),
          servicePointId: servicePointId.length === 0 ? null : servicePointId,
          addBalanceCents,
        })
          .then(onCancel)
          .catch(() => undefined);
      }}
    >
      <label className="form-field">
        <span>Identificação</span>
        <input
          disabled={busy}
          maxLength={100}
          onChange={(event) => {
            setLabel(event.target.value);
          }}
          required
          value={label}
        />
      </label>
      <label className="form-field">
        <span>Código</span>
        <input
          disabled={busy}
          maxLength={32}
          onChange={(event) => {
            setCode(event.target.value.toLocaleUpperCase('pt-BR'));
          }}
          required
          value={code}
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
      </label>
      <label className="form-field">
        <span>Acréscimo de saldo</span>
        <input
          disabled={busy}
          inputMode="decimal"
          onChange={(event) => {
            setAddBalance(event.target.value);
          }}
          placeholder="0,00"
          value={addBalance}
        />
        <small>
          O saldo nunca é reduzido por edição. Informe somente o valor que será acrescentado.
        </small>
      </label>
      <div className="voucher-edit-form__actions">
        <button
          className="button button--ghost button--compact"
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          <X size={15} aria-hidden="true" />
          Fechar
        </button>
        <button
          className="button button--compact"
          disabled={busy || label.trim().length < 2 || code.trim().length < 4}
          type="submit"
        >
          <Save size={15} aria-hidden="true" />
          Salvar alterações
        </button>
      </div>
    </form>
  );
}
