import { ImagePlus, PackagePlus, Save, Trash2, X } from 'lucide-react';
import { useState, type ChangeEvent, type SyntheticEvent } from 'react';

import type {
  CreateProductInput,
  InventoryProduct,
  ProductAdministration,
  ProductCategory,
  ProductFallbackIcon,
  ProductKind,
  UpdateProductInput,
} from '@gtrz/contracts';

import { PRODUCT_ICON_OPTIONS } from './product-icon-options';
import { ProductVisual } from './ProductVisual';

interface ProductFormBaseProps {
  readonly categories: readonly ProductCategory[];
  readonly busy: boolean;
  readonly presentation?: ProductAdministration | undefined;
}

interface CreateProductFormProps extends ProductFormBaseProps {
  readonly product?: undefined;
  readonly onSubmit: (input: CreateProductInput) => Promise<void>;
  readonly onCancel?: undefined;
}

interface UpdateProductFormProps extends ProductFormBaseProps {
  readonly product: InventoryProduct;
  readonly onSubmit: (input: UpdateProductInput) => Promise<void>;
  readonly onCancel: () => void;
}

type ProductFormProps = CreateProductFormProps | UpdateProductFormProps;

function centsToInput(cents: number | undefined): string {
  return cents === undefined ? '' : (cents / 100).toFixed(2);
}

function inputToCents(value: string): number {
  const normalized = value.trim().replace(',', '.');
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0)
    throw new Error('Informe valores monetários válidos.');
  return Math.round(amount * 100);
}

async function readProductImage(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Escolha uma foto PNG, JPG ou WebP.');
  }
  if (file.size > 520_000) {
    throw new Error('A foto deve ter no máximo 500 KB.');
  }
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(new Error('Não foi possível ler a foto.'));
    };
    reader.onload = () => {
      if (typeof reader.result !== 'string') reject(new Error('Não foi possível ler a foto.'));
      else resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function ProductForm(props: ProductFormProps): React.JSX.Element {
  const [categoryId, setCategoryId] = useState(
    props.product?.categoryId ?? props.categories[0]?.id ?? '',
  );
  const [name, setName] = useState(props.product?.name ?? '');
  const [kind, setKind] = useState<ProductKind>(props.product?.kind ?? 'drink');
  const [cost, setCost] = useState(centsToInput(props.product?.financials?.costCents));
  const [salePrice, setSalePrice] = useState(centsToInput(props.product?.salePriceCents));
  const [lowStockThreshold, setLowStockThreshold] = useState(
    String(props.product?.lowStockThreshold ?? 0),
  );
  const [active, setActive] = useState(props.product?.active ?? true);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(
    props.presentation?.imageDataUrl ?? null,
  );
  const [fallbackIcon, setFallbackIcon] = useState<ProductFallbackIcon>(
    props.presentation?.fallbackIcon ?? 'package',
  );
  const [error, setError] = useState<string | null>(null);

  async function handleImage(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    try {
      setImageDataUrl(await readProductImage(file));
      setError(null);
    } catch (imageError: unknown) {
      setError(imageError instanceof Error ? imageError.message : 'Não foi possível usar a foto.');
    } finally {
      event.target.value = '';
    }
  }

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
        imageDataUrl,
        fallbackIcon,
      };
      if (!Number.isInteger(baseInput.lowStockThreshold) || baseInput.lowStockThreshold < 0) {
        throw new Error('O limite de estoque deve ser um número inteiro não negativo.');
      }
      if (props.product === undefined) {
        await props.onSubmit(baseInput);
        setName('');
        setCost('');
        setSalePrice('');
        setLowStockThreshold('0');
        setImageDataUrl(null);
      } else {
        await props.onSubmit({ ...baseInput, productId: props.product.id, active });
      }
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível salvar.');
    }
  }

  return (
    <form className="product-form" onSubmit={(event) => void handleSubmit(event)}>
      <div className="product-media-editor">
        <ProductVisual
          alt={name || 'Produto'}
          fallbackIcon={fallbackIcon}
          imageDataUrl={imageDataUrl}
        />
        <div className="product-media-editor__controls">
          <label className="button button--secondary button--compact">
            <ImagePlus size={15} aria-hidden="true" />
            Escolher foto
            <input
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(event) => void handleImage(event)}
              type="file"
            />
          </label>
          {imageDataUrl === null ? null : (
            <button
              className="button button--ghost button--compact"
              onClick={() => {
                setImageDataUrl(null);
              }}
              type="button"
            >
              <Trash2 size={15} aria-hidden="true" /> Remover foto
            </button>
          )}
          <label className="form-field product-icon-select">
            <span>Ícone quando não houver foto</span>
            <select
              onChange={(event) => {
                setFallbackIcon(event.target.value as ProductFallbackIcon);
              }}
              value={fallbackIcon}
            >
              {PRODUCT_ICON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

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
            {props.categories
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

      {props.product === undefined ? null : (
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
        {props.onCancel === undefined ? null : (
          <button
            className="button button--ghost"
            disabled={props.busy}
            onClick={props.onCancel}
            type="button"
          >
            <X size={16} aria-hidden="true" />
            Cancelar
          </button>
        )}
        <button
          className="button button--primary"
          disabled={props.busy || categoryId.length === 0 || name.trim().length < 2}
          type="submit"
        >
          {props.product === undefined ? (
            <PackagePlus size={17} aria-hidden="true" />
          ) : (
            <Save size={17} aria-hidden="true" />
          )}
          {props.product === undefined ? 'Cadastrar produto' : 'Salvar alterações'}
        </button>
      </div>
    </form>
  );
}
