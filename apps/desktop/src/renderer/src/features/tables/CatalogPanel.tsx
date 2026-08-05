import { Minus, Plus, ShoppingBasket } from 'lucide-react';

import type { OperationalCatalogItem } from '@gtrz/contracts';

import { formatMoney } from '../../shared/money';
import type { CartEntry } from './types';

interface CatalogPanelProps {
  readonly catalog: readonly OperationalCatalogItem[];
  readonly cart: ReadonlyMap<string, CartEntry>;
  readonly disabled: boolean;
  readonly onChangeQuantity: (item: OperationalCatalogItem, delta: number) => void;
}

export function CatalogPanel({
  catalog,
  cart,
  disabled,
  onChangeQuantity,
}: CatalogPanelProps): React.JSX.Element {
  const availableCatalog = catalog.filter((item) => item.active);

  return (
    <article className="panel operation-panel">
      <div className="panel__heading">
        <ShoppingBasket size={20} aria-hidden="true" />
        <div>
          <h2>Produtos e combos</h2>
          <p>O estoque só é baixado depois da confirmação do pagamento.</p>
        </div>
      </div>

      <div className="operation-catalog">
        {availableCatalog.length === 0 ? (
          <p className="inventory-helper">Nenhum produto ou combo ativo disponível.</p>
        ) : null}
        {availableCatalog.map((item) => {
          const key = `${item.kind}:${item.id}`;
          const quantity = cart.get(key)?.quantity ?? 0;
          const canAdd = item.availableUnits > quantity;

          return (
            <div className="operation-item" key={key}>
              <div>
                <span className="operation-item__kind">
                  {item.kind === 'combo' ? 'Combo' : item.categoryName}
                </span>
                <strong>{item.name}</strong>
                <small>
                  {formatMoney(item.salePriceCents)} · {item.availableUnits} disponíveis
                </small>
              </div>
              <div className="quantity-stepper">
                <button
                  aria-label={`Remover uma unidade de ${item.name}`}
                  className="icon-button"
                  disabled={disabled || quantity === 0}
                  onClick={() => {
                    onChangeQuantity(item, -1);
                  }}
                  type="button"
                >
                  <Minus size={15} aria-hidden="true" />
                </button>
                <span>{quantity}</span>
                <button
                  aria-label={`Adicionar uma unidade de ${item.name}`}
                  className="icon-button icon-button--success"
                  disabled={disabled || !canAdd}
                  onClick={() => {
                    onChangeQuantity(item, 1);
                  }}
                  type="button"
                >
                  <Plus size={15} aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
