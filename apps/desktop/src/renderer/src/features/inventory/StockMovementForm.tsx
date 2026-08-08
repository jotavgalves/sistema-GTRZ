import { ArrowDownToLine, X } from 'lucide-react';
import { useMemo, useState, type SyntheticEvent } from 'react';

import type {
  InventoryProduct,
  RecordStockMovementInput,
  StockMovementType,
} from '@gtrz/contracts';

interface StockMovementFormProps {
  readonly product: InventoryProduct;
  readonly initialType: StockMovementType;
  readonly busy: boolean;
  readonly onSubmit: (input: RecordStockMovementInput) => Promise<void>;
  readonly onCancel: () => void;
}

const MOVEMENT_LABELS: Readonly<Record<StockMovementType, string>> = {
  purchase: 'Compra / entrada',
  'correction-positive': 'Correção positiva',
  'correction-negative': 'Correção negativa de entrada',
  loss: 'Perda',
  breakage: 'Quebra',
  'internal-consumption': 'Consumo interno',
  courtesy: 'Cortesia',
  return: 'Devolução ao estoque',
};
const NEGATIVE = new Set<StockMovementType>([
  'correction-negative',
  'loss',
  'breakage',
  'internal-consumption',
  'courtesy',
]);

export function StockMovementForm({
  product,
  initialType,
  busy,
  onSubmit,
  onCancel,
}: StockMovementFormProps): React.JSX.Element {
  const [type, setType] = useState<StockMovementType>(initialType);
  const [quantity, setQuantity] = useState('1');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const parsedQuantity = Number(quantity);
  const isNegative = NEGATIVE.has(type);
  const afterQuantity = useMemo(() => {
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 0) return product.quantity;
    return isNegative
      ? Math.max(product.quantity - parsedQuantity, 0)
      : product.quantity + parsedQuantity;
  }, [isNegative, parsedQuantity, product.quantity]);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0)
        throw new Error('A quantidade deve ser um número inteiro maior que zero.');
      if (isNegative && parsedQuantity > product.quantity)
        throw new Error(`Só existem ${String(product.quantity)} unidades no estoque atual.`);
      await onSubmit({
        productId: product.id,
        type,
        quantity: parsedQuantity,
        note: note.trim() || undefined,
      });
      onCancel();
    } catch (submitError: unknown) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Não foi possível movimentar o estoque.',
      );
    }
  }

  return (
    <form className="movement-form" onSubmit={(event) => void handleSubmit(event)}>
      <div className="movement-form__heading">
        <div>
          <span>Entrada / baixa / ajuste</span>
          <strong>{product.name}</strong>
        </div>
        <span className="stock-number">Estoque atual: {product.quantity} un.</span>
      </div>
      <div className="movement-stock-preview">
        <span>Agora</span>
        <strong>{product.quantity}</strong>
        <span>Após este movimento</span>
        <strong>{afterQuantity}</strong>
      </div>
      <div className="movement-form__grid">
        <label className="form-field">
          <span>Motivo</span>
          <select
            onChange={(event) => {
              setType(event.target.value as StockMovementType);
            }}
            value={type}
          >
            {Object.entries(MOVEMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Quantidade</span>
          <input
            max={isNegative ? product.quantity : undefined}
            min="1"
            onChange={(event) => {
              setQuantity(event.target.value);
            }}
            required
            step="1"
            type="number"
            value={quantity}
          />
        </label>
      </div>
      <p className="movement-form__explanation">
        {type === 'correction-negative'
          ? 'Correção negativa desfaz uma entrada cadastrada com quantidade errada e reduz também o aporte líquido correspondente.'
          : type === 'loss' || type === 'breakage'
            ? 'Perda ou quebra reduz o estoque e o valor atual das mercadorias, mas preserva o custo que realmente foi desembolsado.'
            : type === 'purchase' || type === 'correction-positive'
              ? 'Esta entrada aumenta o saldo e registra o custo correspondente no aporte líquido do evento.'
              : 'O sistema registra este movimento no histórico do estoque.'}
      </p>
      <label className="form-field">
        <span>Observação</span>
        <input
          maxLength={240}
          onChange={(event) => {
            setNote(event.target.value);
          }}
          placeholder="Opcional"
          value={note}
        />
      </label>
      {error === null ? null : <p className="form-error">{error}</p>}
      <div className="product-form__actions">
        <button className="button button--ghost" disabled={busy} onClick={onCancel} type="button">
          <X size={16} aria-hidden="true" />
          Cancelar
        </button>
        <button className="button button--primary" disabled={busy} type="submit">
          <ArrowDownToLine size={17} aria-hidden="true" />
          Registrar movimento
        </button>
      </div>
    </form>
  );
}
