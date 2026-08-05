import { PackagePlus, Save, X } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';

import type {
  CreateProductInput,
  InventoryProduct,
  ProductCategory,
  ProductKind,
  UpdateProductInput,
} from '@gtrz/contracts';

interface ProductFormProps {
  readonly categories: readonly ProductCategory[];
  readonly product?: InventoryProduct;
  readonly busy: boolean;
  readonly onSubmit: (input: CreateProductInput | UpdateProductInput) => Promise<void>;
  readonly onCancel?: () => void;
}

function centsToInput(cents: number | undefined): string {
  return cents === undefined ? '' : (cents / 100).toFixed(2);
}

function inputToCents(value: string): number {
  const normalized = value.trim().replace(',', '.');
  const amount = Number(normalized);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Informe valores monetários válidos.');
  }

  return Math.round(amount * 100);
}

export function ProductForm({
  categories,
  product,
  busy,
  onSubmit,
  onCancel,
}: ProductFormProps): React.JSX.Element {
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? categories[0]?.id ?? '');
  const [name, setName] = useState(product?.name ?? '');
  const [kind, setKind] = useState<ProductKind>(product?.kind ?? 'drink');
  const [cost, setCost] = useState(centsToInput(product?.financials?.costCents));
  const [salePrice, setSalePrice] = useState(centsToInput(product?.salePriceCents));
  const [lowStockThreshold, setLowStockThreshold] = useState(
    String(product?.lowStockThreshold ?? 0),
  );
  const [active, setActive] = useState(product?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    try {
      const baseInput: CreateProductInput = {
        categoryId,
        name,
        kind,
        costCents: inputToCents(cost),
        salePriceCents: inputToCents(salePrice),
        lowStockThreshold: Number(lowStockThreshold),
      };

      if (!Number.isInteger(baseInput.lowStockThreshold) || baseInput.lowStockThreshold < 0) {
        throw new Error('O limite de estoque deve ser um número inteiro não negativo.');
      }

      await onSubmit(
        product === undefined
          ? baseInput
          : {
              ...baseInput,
              productId: product.id,
              active,
            },
      );

      if (product === undefined) {
        setName('');
        setCost('');
        setSalePrice('');
        setLowStockThreshold('0');
      }
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível salvar.');
    }
  }

  return (
    <form className="product-form" onSubmit={(event) => void handleSubmit(event)}>
      <div className="product-form__grid">
        <label className="form-field">
          <span>Nome</span>
          <input
            maxLength={100}
            minLength={2}
            onChange={(event) => {
              setName(event.target.value);
            }}
            placeholder="Ex.: Budweiser lata"
            required
            value={name}
          />
        </label>

        <label className="form-field">
          <span>Categoria</span>
          <select
            onChange={(event) => {
              setCategoryId(event.target.value);
            }}
            required
            value={categoryId}
          >
            <option value="">Selecione</option>
            {categories
              .filter((category) => category.active)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </select>
        </label>

        <label className="form-field">
          <span>Tipo</span>
          <select
            onChange={(event) => {
              setKind(event.target.value as ProductKind);
            }}
            value={kind}
          >
            <option value="drink">Bebida</option>
            <option value="food">Comida</option>
          </select>
        </label>

        <label className="form-field">
          <span>Preço de custo</span>
          <input
            inputMode="decimal"
            min="0"
            onChange={(event) => {
              setCost(event.target.value);
            }}
            placeholder="0,00"
            required
            step="0.01"
            type="number"
            value={cost}
          />
        </label>

        <label className="form-field">
          <span>Preço de venda</span>
          <input
            inputMode="decimal"
            min="0"
            onChange={(event) => {
              setSalePrice(event.target.value);
            }}
            placeholder="0,00"
            required
            step="0.01"
            type="number"
            value={salePrice}
          />
        </label>

        <label className="form-field">
          <span>Aviso de estoque baixo</span>
          <input
            min="0"
            onChange={(event) => {
              setLowStockThreshold(event.target.value);
            }}
            required
            step="1"
            type="number"
            value={lowStockThreshold}
          />
        </label>
      </div>

      {product === undefined ? null : (
        <label className="checkbox-field">
          <input
            checked={active}
            onChange={(event) => {
              setActive(event.target.checked);
            }}
            type="checkbox"
          />
          Produto ativo para novas vendas
        </label>
      )}

      {error === null ? null : <p className="form-error">{error}</p>}

      <div className="product-form__actions">
        {onCancel === undefined ? null : (
          <button className="button button--ghost" disabled={busy} onClick={onCancel} type="button">
            <X size={16} aria-hidden="true" />
            Cancelar
          </button>
        )}
        <button
          className="button button--primary"
          disabled={busy || categoryId.length === 0 || name.trim().length < 2}
          type="submit"
        >
          {product === undefined ? (
            <PackagePlus size={17} aria-hidden="true" />
          ) : (
            <Save size={17} aria-hidden="true" />
          )}
          {product === undefined ? 'Cadastrar produto' : 'Salvar alterações'}
        </button>
      </div>
    </form>
  );
}
