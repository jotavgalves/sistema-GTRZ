import { ArrowDownToLine, ArrowUpFromLine, LockKeyhole, UnlockKeyhole } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';

import type {
  AddCashMovementInput,
  CashSummary,
  CloseCashSessionInput,
  OpenCashSessionInput,
} from '@gtrz/contracts';

import { formatMoney, parseMoneyInput } from '../../shared/money';

interface CashControlsProps {
  readonly summary: CashSummary;
  readonly busy: boolean;
  readonly onOpen: (input: OpenCashSessionInput) => Promise<void>;
  readonly onClose: (input: CloseCashSessionInput) => Promise<void>;
  readonly onAddMovement: (input: AddCashMovementInput) => Promise<void>;
}

export function CashControls({
  summary,
  busy,
  onOpen,
  onClose,
  onAddMovement,
}: CashControlsProps): React.JSX.Element {
  const [openingFloat, setOpeningFloat] = useState('');
  const [countedClosing, setCountedClosing] = useState('');
  const [movementType, setMovementType] = useState<'supply' | 'withdrawal'>('supply');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementNote, setMovementNote] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const open = summary.session?.status === 'open';

  async function submitOpen(formEvent: SyntheticEvent<HTMLFormElement>): Promise<void> {
    formEvent.preventDefault();
    setLocalError(null);

    try {
      await onOpen({ openingFloatCents: parseMoneyInput(openingFloat || '0') });
      setOpeningFloat('');
    } catch (error: unknown) {
      setLocalError(error instanceof Error ? error.message : 'Não foi possível abrir o caixa.');
    }
  }

  async function submitClose(formEvent: SyntheticEvent<HTMLFormElement>): Promise<void> {
    formEvent.preventDefault();
    setLocalError(null);

    try {
      await onClose({ countedClosingCents: parseMoneyInput(countedClosing) });
      setCountedClosing('');
    } catch (error: unknown) {
      setLocalError(error instanceof Error ? error.message : 'Não foi possível fechar o caixa.');
    }
  }

  async function submitMovement(formEvent: SyntheticEvent<HTMLFormElement>): Promise<void> {
    formEvent.preventDefault();
    setLocalError(null);

    try {
      await onAddMovement({
        type: movementType,
        amountCents: parseMoneyInput(movementAmount),
        note: movementNote,
      });
      setMovementAmount('');
      setMovementNote('');
    } catch (error: unknown) {
      setLocalError(
        error instanceof Error ? error.message : 'Não foi possível registrar a movimentação.',
      );
    }
  }

  return (
    <div className="cash-control-grid">
      {!open ? (
        <article className="panel cash-control-card">
          <div className="panel__heading">
            <UnlockKeyhole size={20} aria-hidden="true" />
            <div>
              <h2>Abrir caixa</h2>
              <p>Informe o fundo inicial disponível em dinheiro.</p>
            </div>
          </div>
          <form className="operation-form" onSubmit={(event) => void submitOpen(event)}>
            <label>
              Fundo inicial
              <input
                inputMode="decimal"
                onChange={(event) => {
                  setOpeningFloat(event.target.value);
                }}
                placeholder="0,00"
                value={openingFloat}
              />
            </label>
            <button className="button button--primary" disabled={busy} type="submit">
              Abrir caixa
            </button>
          </form>
        </article>
      ) : (
        <>
          <article className="panel cash-control-card">
            <div className="panel__heading">
              {movementType === 'supply' ? (
                <ArrowDownToLine size={20} aria-hidden="true" />
              ) : (
                <ArrowUpFromLine size={20} aria-hidden="true" />
              )}
              <div>
                <h2>Movimentação manual</h2>
                <p>Registre suprimento ou sangria com justificativa.</p>
              </div>
            </div>
            <form className="operation-form" onSubmit={(event) => void submitMovement(event)}>
              <label>
                Tipo
                <select
                  onChange={(event) => {
                    setMovementType(event.target.value as 'supply' | 'withdrawal');
                  }}
                  value={movementType}
                >
                  <option value="supply">Suprimento</option>
                  <option value="withdrawal">Sangria</option>
                </select>
              </label>
              <label>
                Valor
                <input
                  inputMode="decimal"
                  onChange={(event) => {
                    setMovementAmount(event.target.value);
                  }}
                  placeholder="0,00"
                  required
                  value={movementAmount}
                />
              </label>
              <label>
                Observação
                <input
                  minLength={2}
                  onChange={(event) => {
                    setMovementNote(event.target.value);
                  }}
                  required
                  value={movementNote}
                />
              </label>
              <button className="button button--secondary" disabled={busy} type="submit">
                Registrar
              </button>
            </form>
          </article>

          <article className="panel cash-control-card">
            <div className="panel__heading">
              <LockKeyhole size={20} aria-hidden="true" />
              <div>
                <h2>Fechar caixa</h2>
                <p>Esperado em dinheiro: {formatMoney(summary.expectedCashCents)}</p>
              </div>
            </div>
            <form className="operation-form" onSubmit={(event) => void submitClose(event)}>
              <label>
                Valor contado
                <input
                  inputMode="decimal"
                  onChange={(event) => {
                    setCountedClosing(event.target.value);
                  }}
                  placeholder="0,00"
                  required
                  value={countedClosing}
                />
              </label>
              <button className="button button--danger" disabled={busy} type="submit">
                Fechar caixa
              </button>
            </form>
          </article>
        </>
      )}

      {localError === null ? null : <p className="form-error">{localError}</p>}
    </div>
  );
}
