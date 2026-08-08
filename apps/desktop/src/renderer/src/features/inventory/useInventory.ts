import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  CreateProductInput,
  DeleteProductInput,
  InventoryState,
  ProductAdministration,
  ProductDeletionImpact,
  RecordStockMovementInput,
  SetProductPresentationInput,
  UpdateProductInput,
} from '@gtrz/contracts';

interface InventoryViewState {
  readonly state: InventoryState | null;
  readonly administration: ReadonlyMap<string, ProductAdministration>;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly message: string | null;
  readonly reload: () => Promise<void>;
  readonly createCategory: (name: string) => Promise<void>;
  readonly createProduct: (input: CreateProductInput) => Promise<void>;
  readonly updateProduct: (input: UpdateProductInput) => Promise<void>;
  readonly recordMovement: (input: RecordStockMovementInput) => Promise<void>;
  readonly setPresentation: (input: SetProductPresentationInput) => Promise<void>;
  readonly previewDeletion: (productId: string) => Promise<ProductDeletionImpact>;
  readonly deleteProduct: (input: DeleteProductInput) => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível atualizar o estoque.';
}

export function useInventory(): InventoryViewState {
  const [state, setState] = useState<InventoryState | null>(null);
  const [adminRows, setAdminRows] = useState<readonly ProductAdministration[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const administration = useMemo(
    () => new Map(adminRows.map((item) => [item.productId, item])),
    [adminRows],
  );

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const [nextState, nextAdministration] = await Promise.all([
        window.gtrz.inventory.getState(),
        window.gtrz.inventory.listAdministration(),
      ]);
      setState(nextState);
      setAdminRows(nextAdministration);
    } catch (loadError: unknown) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = useCallback(
    async <T,>(operation: () => Promise<T>, successMessage: string): Promise<T> => {
      setBusy(true);
      setError(null);
      setMessage(null);

      try {
        const result = await operation();
        await reload();
        setMessage(successMessage);
        return result;
      } catch (operationError: unknown) {
        const failureMessage = getErrorMessage(operationError);
        setError(failureMessage);
        throw new Error(failureMessage);
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  const createCategory = useCallback(
    async (name: string): Promise<void> => {
      await run(() => window.gtrz.inventory.createCategory({ name }), 'Categoria criada.');
    },
    [run],
  );

  const createProduct = useCallback(
    async (input: CreateProductInput): Promise<void> => {
      await run(async () => {
        const product = await window.gtrz.inventory.createProduct(input);
        await window.gtrz.inventory.setPresentation({
          productId: product.id,
          imageDataUrl: input.imageDataUrl ?? null,
          fallbackIcon: input.fallbackIcon ?? 'package',
        });
        return product;
      }, 'Produto cadastrado.');
    },
    [run],
  );

  const updateProduct = useCallback(
    async (input: UpdateProductInput): Promise<void> => {
      await run(async () => {
        const product = await window.gtrz.inventory.updateProduct(input);
        await window.gtrz.inventory.setPresentation({
          productId: input.productId,
          imageDataUrl: input.imageDataUrl ?? null,
          fallbackIcon: input.fallbackIcon ?? 'package',
        });
        return product;
      }, 'Produto atualizado.');
    },
    [run],
  );

  const recordMovement = useCallback(
    async (input: RecordStockMovementInput): Promise<void> => {
      await run(() => window.gtrz.inventory.recordMovement(input), 'Estoque atualizado.');
    },
    [run],
  );

  const setPresentation = useCallback(
    async (input: SetProductPresentationInput): Promise<void> => {
      await run(() => window.gtrz.inventory.setPresentation(input), 'Imagem do produto atualizada.');
    },
    [run],
  );

  const previewDeletion = useCallback(
    async (productId: string): Promise<ProductDeletionImpact> =>
      window.gtrz.inventory.previewDeletion(productId),
    [],
  );

  const deleteProduct = useCallback(
    async (input: DeleteProductInput): Promise<void> => {
      await run(
        () => window.gtrz.inventory.deleteProduct(input),
        input.mode === 'refund-active-event-sales'
          ? 'Vendas do evento estornadas e produto excluído.'
          : 'Produto excluído; vendas históricas preservadas.',
      );
    },
    [run],
  );

  return {
    state,
    administration,
    loading,
    busy,
    error,
    message,
    reload,
    createCategory,
    createProduct,
    updateProduct,
    recordMovement,
    setPresentation,
    previewDeletion,
    deleteProduct,
  };
}
