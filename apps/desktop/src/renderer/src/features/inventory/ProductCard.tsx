import { ArrowDownToLine, Pencil, Trash2, TriangleAlert, X } from 'lucide-react';
import { useState } from 'react';

import type {
  DeleteProductInput,
  InventoryProduct,
  ProductAdministration,
  ProductCategory,
  ProductDeletionImpact,
  RecordStockMovementInput,
  UpdateProductInput,
} from '@gtrz/contracts';

import { ProductForm } from './ProductForm';
import { ProductVisual } from './ProductVisual';
import { StockMovementForm } from './StockMovementForm';

interface ProductCardProps {
  readonly product: InventoryProduct;
  readonly presentation: ProductAdministration | undefined;
  readonly categories: readonly ProductCategory[];
  readonly production: boolean;
  readonly hasActiveEvent: boolean;
  readonly busy: boolean;
  readonly onUpdate: (input: UpdateProductInput) => Promise<void>;
  readonly onMovement: (input: RecordStockMovementInput) => Promise<void>;
  readonly onPreviewDeletion: (productId: string) => Promise<ProductDeletionImpact>;
  readonly onDelete: (input: DeleteProductInput) => Promise<void>;
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export function ProductCard({
  product,
  presentation,
  categories,
  production,
  hasActiveEvent,
  busy,
  onUpdate,
  onMovement,
  onPreviewDeletion,
  onDelete,
}: ProductCardProps): React.JSX.Element {
  const [mode, setMode] = useState<'view' | 'edit' | 'movement' | 'delete'>('view');
  const [impact, setImpact] = useState<ProductDeletionImpact | null>(null);
  const [reason, setReason] = useState('');

  if (mode === 'edit')
    return (
      <article className="inventory-card inventory-card--expanded">
        <ProductForm
          busy={busy}
          categories={categories}
          onCancel={() => setMode('view')}
          onSubmit={async (input) => {
            await onUpdate(input);
            setMode('view');
          }}
          presentation={presentation}
          product={product}
        />
      </article>
    );
  if (mode === 'movement')
    return (
      <article className="inventory-card inventory-card--expanded">
        <StockMovementForm
          busy={busy}
          onCancel={() => setMode('view')}
          onSubmit={onMovement}
          product={product}
        />
      </article>
    );

  if (mode === 'delete') {
    return (
      <article className="inventory-card inventory-card--expanded product-delete-panel">
        <div className="product-delete-panel__header">
          <div>
            <span>Excluir produto definitivamente</span>
            <h2>{product.name}</h2>
          </div>
          <button
            className="icon-button"
            onClick={() => {
              setMode('view');
              setImpact(null);
            }}
            type="button"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>
        {impact === null ? (
          <p>Calculando impacto…</p>
        ) : (
          <>
            {impact.openOrdersCount > 0 ? (
              <p className="form-error">
                O produto está em {impact.openOrdersCount} comanda(s) aberta(s). Remova-o dessas
                comandas antes de excluir.
              </p>
            ) : null}
            <div className="product-delete-impact">
              <span>
                Estoque cadastrado<strong>{impact.currentQuantity} un.</strong>
              </span>
              <span>
                Vendas pagas no evento<strong>{impact.paidOrdersInActiveEventCount}</strong>
              </span>
              <span>
                Vendas históricas<strong>{impact.paidOrdersHistoricalCount}</strong>
              </span>
              <span>
                Combos afetados<strong>{impact.affectedCombosCount}</strong>
              </span>
            </div>
            <label className="form-field">
              <span>Motivo da exclusão</span>
              <input
                maxLength={240}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ex.: produto cadastrado incorretamente"
                value={reason}
              />
            </label>
            <div className="product-delete-panel__actions">
              <button
                className="button button--danger"
                disabled={busy || impact.openOrdersCount > 0 || reason.trim().length < 3}
                onClick={() =>
                  void onDelete({ productId: product.id, mode: 'keep-sales-history', reason }).then(
                    () => setMode('view'),
                  )
                }
                type="button"
              >
                Excluir e manter vendas no histórico
              </button>
              <button
                className="button button--danger"
                disabled={
                  busy || impact.openOrdersCount > 0 || !hasActiveEvent || reason.trim().length < 3
                }
                onClick={() =>
                  void onDelete({
                    productId: product.id,
                    mode: 'refund-active-event-sales',
                    reason,
                  }).then(() => setMode('view'))
                }
                type="button"
              >
                Estornar vendas deste evento e excluir
              </button>
            </div>
            <small>
              Ao manter o histórico, nome, quantidade e preço das vendas antigas continuam
              registrados. Combos que dependem deste produto são desativados.
            </small>
          </>
        )}
      </article>
    );
  }

  const imageDataUrl = presentation?.imageDataUrl ?? null;
  const fallbackIcon = presentation?.fallbackIcon ?? 'package';
  return (
    <article
      className={
        product.active
          ? 'inventory-card inventory-card--compact'
          : 'inventory-card inventory-card--compact inventory-card--inactive'
      }
    >
      <div className="inventory-card__compact-main">
        <ProductVisual alt={product.name} fallbackIcon={fallbackIcon} imageDataUrl={imageDataUrl} />
        <div className="inventory-card__identity">
          <span>{product.categoryName}</span>
          <h2>{product.name}</h2>
          <strong>{formatMoney(product.salePriceCents)}</strong>
        </div>
        <span className={product.lowStock ? 'stock-badge stock-badge--low' : 'stock-badge'}>
          {product.lowStock ? <TriangleAlert size={14} aria-hidden="true" /> : null}
          {product.quantity} un.
        </span>
      </div>
      {production ? (
        <div className="inventory-card__compact-finance">
          <span>
            Custo un.<strong>{formatMoney(product.financials?.costCents ?? 0)}</strong>
          </span>
          <span>
            Valor atual em estoque
            <strong>
              {formatMoney(
                presentation?.currentStockValueCents ??
                  product.quantity * (product.financials?.costCents ?? 0),
              )}
            </strong>
          </span>
          <span>
            Aporte líquido<strong>{formatMoney(presentation?.contributedCostCents ?? 0)}</strong>
          </span>
        </div>
      ) : null}
      {production ? (
        <div className="inventory-card__actions">
          <button
            className="button button--ghost button--compact"
            disabled={busy}
            onClick={() => setMode('edit')}
            type="button"
          >
            <Pencil size={15} aria-hidden="true" />
            Editar
          </button>
          <button
            className="button button--secondary button--compact"
            disabled={busy || !hasActiveEvent}
            onClick={() => setMode('movement')}
            type="button"
          >
            <ArrowDownToLine size={15} aria-hidden="true" />
            Baixar estoque · {product.quantity} un.
          </button>
          <button
            className="button button--danger button--compact"
            disabled={busy}
            onClick={() => {
              setMode('delete');
              setReason('');
              void onPreviewDeletion(product.id)
                .then(setImpact)
                .catch(() => setImpact(null));
            }}
            type="button"
          >
            <Trash2 size={15} aria-hidden="true" />
            Excluir
          </button>
        </div>
      ) : null}
    </article>
  );
}
