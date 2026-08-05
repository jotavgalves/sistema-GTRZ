import { CirclePlay, Plus, Square } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';

import type { ChangeSaleTableStatusInput, CreateSaleTableInput, SaleTable } from '@gtrz/contracts';

import { formatMoney } from '../../shared/money';

interface TablePanelProps {
  readonly tables: readonly SaleTable[];
  readonly production: boolean;
  readonly busy: boolean;
  readonly onCreate: (input: CreateSaleTableInput) => Promise<void>;
  readonly onChangeStatus: (input: ChangeSaleTableStatusInput) => Promise<void>;
}

export function TablePanel({
  tables,
  production,
  busy,
  onCreate,
  onChangeStatus,
}: TablePanelProps): React.JSX.Element {
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(formEvent: SyntheticEvent<HTMLFormElement>): Promise<void> {
    formEvent.preventDefault();
    setLocalError(null);

    try {
      await onCreate({ name });
      setName('');
    } catch (error: unknown) {
      setLocalError(error instanceof Error ? error.message : 'Não foi possível criar a mesa.');
    }
  }

  return (
    <article className="panel table-panel">
      <div className="panel__heading">
        <CirclePlay size={20} aria-hidden="true" />
        <div>
          <h2>Mesas do evento</h2>
          <p>O Balcão é permanente. As demais mesas podem ser fechadas e reabertas.</p>
        </div>
      </div>

      {production ? (
        <form className="inline-create-form" onSubmit={(event) => void submit(event)}>
          <label>
            Nome da nova mesa
            <input
              maxLength={80}
              minLength={1}
              onChange={(event) => {
                setName(event.target.value);
              }}
              placeholder="Ex.: Mesa 12"
              required
              value={name}
            />
          </label>
          <button className="button button--primary button--compact" disabled={busy} type="submit">
            <Plus size={16} aria-hidden="true" />
            Criar mesa
          </button>
        </form>
      ) : null}

      {localError === null ? null : <p className="form-error">{localError}</p>}

      <div className="table-grid">
        {tables.map((table) => (
          <article
            className={table.status === 'open' ? 'table-card table-card--open' : 'table-card'}
            key={table.id}
          >
            <div>
              <span>{table.kind === 'counter' ? 'Permanente' : 'Mesa'}</span>
              <h3>{table.name}</h3>
            </div>
            <dl>
              <div>
                <dt>Vendas</dt>
                <dd>{table.saleCount}</dd>
              </div>
              <div>
                <dt>Total pago</dt>
                <dd>{formatMoney(table.totalPaidCents)}</dd>
              </div>
            </dl>
            <span className={`status-badge status-badge--${table.status}`}>
              {table.status === 'open' ? 'Aberta' : 'Encerrada'}
            </span>
            {table.kind === 'table' ? (
              <button
                className="button button--secondary button--compact"
                disabled={busy}
                onClick={() => {
                  void onChangeStatus({
                    tableId: table.id,
                    status: table.status === 'open' ? 'closed' : 'open',
                  });
                }}
                type="button"
              >
                {table.status === 'open' ? (
                  <>
                    <Square size={15} aria-hidden="true" />
                    Encerrar
                  </>
                ) : (
                  <>
                    <CirclePlay size={15} aria-hidden="true" />
                    Reabrir
                  </>
                )}
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </article>
  );
}
