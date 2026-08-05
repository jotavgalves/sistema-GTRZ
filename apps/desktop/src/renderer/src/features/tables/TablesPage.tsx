import { RefreshCw, TableProperties, WalletCards } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { OperationalCatalogItem } from '@gtrz/contracts';

import { useSession } from '../../shared/session/session-context';
import { formatMoney } from '../../shared/money';
import { CatalogPanel } from './CatalogPanel';
import { CheckoutPanel } from './CheckoutPanel';
import { SalesHistory } from './SalesHistory';
import { TablePanel } from './TablePanel';
import type { CartEntry } from './types';
import { useOperations } from './useOperations';

export function TablesPage(): React.JSX.Element {
  const { state: sessionState } = useSession();
  const {
    state,
    loading,
    busy,
    error,
    message,
    reload,
    createTable,
    changeTableStatus,
    checkout,
    cancelSale,
  } = useOperations();
  const [cart, setCart] = useState<ReadonlyMap<string, CartEntry>>(new Map());
  const production = sessionState?.profile === 'production';
  const tables = state?.tables ?? [];
  const catalog = state?.catalog ?? [];
  const sales = state?.recentSales ?? [];
  const totalPaidCents = sales.reduce(
    (total, sale) => total + (sale.status === 'paid' ? sale.totalCents : 0),
    0,
  );
  const cartUnits = useMemo(
    () => [...cart.values()].reduce((total, entry) => total + entry.quantity, 0),
    [cart],
  );

  function changeQuantity(item: OperationalCatalogItem, delta: number): void {
    const key = `${item.kind}:${item.id}`;
    setCart((current) => {
      const next = new Map(current);
      const existing = next.get(key);
      const quantity = Math.max(0, Math.min(item.availableUnits, (existing?.quantity ?? 0) + delta));

      if (quantity === 0) {
        next.delete(key);
      } else {
        next.set(key, { item, quantity });
      }

      return next;
    });
  }

  return (
    <section className="feature-page">
      <header className="feature-header">
        <div>
          <span className="eyebrow">Operação imediata do evento</span>
          <h1>Mesas e Balcão</h1>
          <p>
            Monte o carrinho, receba o pagamento e baixe o estoque somente após a confirmação.
          </p>
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
          <span>Mesas abertas</span>
          <strong>{tables.filter((table) => table.status === 'open').length}</strong>
        </article>
        <article className="summary-card">
          <span>Vendas pagas</span>
          <strong>{sales.filter((sale) => sale.status === 'paid').length}</strong>
        </article>
        <article className="summary-card">
          <span>Faturamento recente</span>
          <strong>{formatMoney(totalPaidCents)}</strong>
        </article>
        <article className="summary-card summary-card--accent">
          <span>Itens no carrinho</span>
          <strong>{cartUnits}</strong>
        </article>
      </div>

      {state?.activeEventId === null || state === null ? (
        <div className="inventory-warning">
          <TableProperties size={19} aria-hidden="true" />
          <span>Selecione um evento aberto para operar mesas e vendas.</span>
        </div>
      ) : null}
      {error === null ? null : <p className="form-error">{error}</p>}
      {message === null ? null : <p className="form-success">{message}</p>}

      {loading ? <div className="route-state">Carregando operação…</div> : null}
      {!loading && state?.activeEventId !== null && state !== null ? (
        <>
          <TablePanel
            busy={busy}
            onChangeStatus={changeTableStatus}
            onCreate={createTable}
            production={production}
            tables={tables}
          />

          <div className="operation-layout">
            <CatalogPanel
              catalog={catalog}
              cart={cart}
              disabled={busy}
              onChangeQuantity={changeQuantity}
            />
            <CheckoutPanel
              busy={busy}
              cart={cart}
              onCheckout={checkout}
              onClear={() => {
                setCart(new Map());
              }}
              tables={tables}
            />
          </div>

          <div className="operation-note">
            <WalletCards size={18} aria-hidden="true" />
            <span>
              Pagamentos mistos usam exatamente duas parcelas e aceitam no máximo um voucher.
            </span>
          </div>

          <SalesHistory
            busy={busy}
            onCancel={cancelSale}
            production={production}
            sales={sales}
          />
        </>
      ) : null}
    </section>
  );
}
