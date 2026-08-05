import { Plus, RefreshCw, Ticket } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';

import type { VoucherOrigin } from '@gtrz/contracts';

import { formatMoney, parseMoneyInput } from '../../shared/money';
import { VoucherCard } from './VoucherCard';
import { useVouchers } from './useVouchers';

export function VouchersPage(): React.JSX.Element {
  const { state, loading, busy, error, message, reload, create, changeStatus } = useVouchers();
  const [code, setCode] = useState('');
  const [origin, setOrigin] = useState<VoucherOrigin>('pre-sale');
  const [balance, setBalance] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const vouchers = state?.vouchers ?? [];
  const active = vouchers.filter((voucher) => voucher.status === 'active');
  const availableBalance = active.reduce((total, voucher) => total + voucher.balanceCents, 0);

  async function submit(formEvent: SyntheticEvent<HTMLFormElement>): Promise<void> {
    formEvent.preventDefault();
    setLocalError(null);

    try {
      await create({
        ...(code.trim().length > 0 ? { code: code.trim() } : {}),
        origin,
        initialBalanceCents: parseMoneyInput(balance),
      });
      setCode('');
      setBalance('');
    } catch (submitError: unknown) {
      setLocalError(
        submitError instanceof Error ? submitError.message : 'Não foi possível emitir o voucher.',
      );
    }
  }

  return (
    <section className="feature-page">
      <header className="feature-header">
        <div>
          <span className="eyebrow">Crédito monetário do evento</span>
          <h1>Vouchers</h1>
          <p>Emita créditos, acompanhe saldos e permita uso parcial ou misto nas vendas.</p>
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
        <article className="summary-card">
          <span>Ativos</span>
          <strong>{active.length}</strong>
        </article>
        <article className="summary-card summary-card--accent">
          <span>Saldo disponível</span>
          <strong>{formatMoney(availableBalance)}</strong>
        </article>
        <article className="summary-card">
          <span>Esgotados</span>
          <strong>{vouchers.filter((voucher) => voucher.status === 'depleted').length}</strong>
        </article>
        <article className="summary-card">
          <span>Cancelados</span>
          <strong>{vouchers.filter((voucher) => voucher.status === 'cancelled').length}</strong>
        </article>
      </div>

      {state?.activeEventId === null || state === null ? (
        <div className="inventory-warning">
          <Ticket size={19} aria-hidden="true" />
          <span>Selecione um evento aberto para emitir vouchers.</span>
        </div>
      ) : null}
      {error === null ? null : <p className="form-error">{error}</p>}
      {message === null ? null : <p className="form-success">{message}</p>}

      {state?.activeEventId !== null && state !== null ? (
        <article className="panel voucher-create-panel">
          <div className="panel__heading">
            <Plus size={20} aria-hidden="true" />
            <div>
              <h2>Emitir voucher</h2>
              <p>Deixe o código vazio para gerar automaticamente.</p>
            </div>
          </div>
          <form className="voucher-form" onSubmit={(event) => void submit(event)}>
            <label>
              Código opcional
              <input
                maxLength={80}
                onChange={(event) => {
                  setCode(event.target.value);
                }}
                placeholder="Ex.: CONVIDADO-01"
                value={code}
              />
            </label>
            <label>
              Origem
              <select
                onChange={(event) => {
                  setOrigin(event.target.value as VoucherOrigin);
                }}
                value={origin}
              >
                <option value="pre-sale">Pré-venda</option>
                <option value="local-sale">Venda local</option>
                <option value="courtesy">Cortesia</option>
              </select>
            </label>
            <label>
              Saldo inicial
              <input
                inputMode="decimal"
                onChange={(event) => {
                  setBalance(event.target.value);
                }}
                placeholder="0,00"
                required
                value={balance}
              />
            </label>
            <button className="button button--primary" disabled={busy} type="submit">
              Emitir voucher
            </button>
          </form>
          {localError === null ? null : <p className="form-error">{localError}</p>}
        </article>
      ) : null}

      <div className="voucher-grid">
        {loading ? <div className="route-state">Carregando vouchers…</div> : null}
        {!loading && vouchers.length === 0 ? (
          <div className="empty-state">
            <Ticket size={32} aria-hidden="true" />
            <h2>Nenhum voucher emitido</h2>
            <p>Use o formulário acima para criar o primeiro crédito.</p>
          </div>
        ) : null}
        {vouchers.map((voucher) => (
          <VoucherCard
            busy={busy}
            key={voucher.id}
            onChangeStatus={changeStatus}
            voucher={voucher}
          />
        ))}
      </div>
    </section>
  );
}
