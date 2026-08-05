import { FolderPlus, Plus } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';

import type {
  CreateExpenseCategoryInput,
  CreateExpenseInput,
  ExpenseCategory,
} from '@gtrz/contracts';

import { parseMoneyInput } from '../../shared/money';

interface ExpenseFormsProps {
  readonly categories: readonly ExpenseCategory[];
  readonly busy: boolean;
  readonly onCreateCategory: (input: CreateExpenseCategoryInput) => Promise<void>;
  readonly onCreateExpense: (input: CreateExpenseInput) => Promise<void>;
}

export function ExpenseForms({
  categories,
  busy,
  onCreateCategory,
  onCreateExpense,
}: ExpenseFormsProps): React.JSX.Element {
  const [categoryName, setCategoryName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [total, setTotal] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  async function submitCategory(formEvent: SyntheticEvent<HTMLFormElement>): Promise<void> {
    formEvent.preventDefault();
    setLocalError(null);

    try {
      await onCreateCategory({ name: categoryName });
      setCategoryName('');
    } catch (error: unknown) {
      setLocalError(error instanceof Error ? error.message : 'Não foi possível criar a categoria.');
    }
  }

  async function submitExpense(formEvent: SyntheticEvent<HTMLFormElement>): Promise<void> {
    formEvent.preventDefault();
    setLocalError(null);

    try {
      if (categoryId.length === 0) {
        throw new Error('Selecione uma categoria.');
      }

      await onCreateExpense({
        categoryId,
        description,
        totalCents: parseMoneyInput(total),
        ...(dueAt.length > 0 ? { dueAt: new Date(`${dueAt}T12:00:00`).getTime() } : {}),
      });
      setDescription('');
      setTotal('');
      setDueAt('');
    } catch (error: unknown) {
      setLocalError(error instanceof Error ? error.message : 'Não foi possível criar a despesa.');
    }
  }

  return (
    <div className="expense-form-grid">
      <article className="panel expense-form-panel">
        <div className="panel__heading">
          <FolderPlus size={20} aria-hidden="true" />
          <div>
            <h2>Nova categoria</h2>
            <p>Organize compromissos por fornecedor ou finalidade.</p>
          </div>
        </div>
        <form className="operation-form" onSubmit={(event) => void submitCategory(event)}>
          <label>
            Nome
            <input
              minLength={2}
              onChange={(event) => {
                setCategoryName(event.target.value);
              }}
              placeholder="Ex.: Estrutura"
              required
              value={categoryName}
            />
          </label>
          <button className="button button--secondary" disabled={busy} type="submit">
            Criar categoria
          </button>
        </form>
      </article>

      <article className="panel expense-form-panel">
        <div className="panel__heading">
          <Plus size={20} aria-hidden="true" />
          <div>
            <h2>Nova despesa</h2>
            <p>O compromisso pode permanecer aberto ou receber pagamentos parciais.</p>
          </div>
        </div>
        <form className="operation-form" onSubmit={(event) => void submitExpense(event)}>
          <label>
            Categoria
            <select
              onChange={(event) => {
                setCategoryId(event.target.value);
              }}
              required
              value={categoryId}
            >
              <option value="">Selecione</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Descrição
            <input
              minLength={2}
              onChange={(event) => {
                setDescription(event.target.value);
              }}
              placeholder="Ex.: Locação de grades"
              required
              value={description}
            />
          </label>
          <label>
            Valor total
            <input
              inputMode="decimal"
              onChange={(event) => {
                setTotal(event.target.value);
              }}
              placeholder="0,00"
              required
              value={total}
            />
          </label>
          <label>
            Vencimento opcional
            <input
              onChange={(event) => {
                setDueAt(event.target.value);
              }}
              type="date"
              value={dueAt}
            />
          </label>
          <button
            className="button button--primary"
            disabled={busy || categories.length === 0}
            type="submit"
          >
            Registrar despesa
          </button>
        </form>
      </article>

      {localError === null ? null : <p className="form-error">{localError}</p>}
    </div>
  );
}
