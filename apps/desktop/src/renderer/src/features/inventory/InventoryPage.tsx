import { Boxes, PackagePlus, RefreshCw, Search, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { ProductKind } from '@gtrz/contracts';

import { useSession } from '../../shared/session/session-context';
import { CategoryForm } from './CategoryForm';
import { ComboSection } from './ComboSection';
import { ProductCard } from './ProductCard';
import { ProductForm } from './ProductForm';
import { StockTransferSection } from './StockTransferSection';
import { useInventory } from './useInventory';

function formatMoney(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export function InventoryPage(): React.JSX.Element {
  const { state: sessionState } = useSession();
  const {
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
    previewDeletion,
    deleteProduct,
  } = useInventory();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<ProductKind | 'all'>('all');
  const [categoryId, setCategoryId] = useState('all');
  const production = sessionState?.profile === 'production';
  const categories = useMemo(() => state?.categories ?? [], [state?.categories]);
  const products = useMemo(() => state?.products ?? [], [state?.products]);
  const activeEventId = state?.activeEventId ?? null;
  const hasActiveEvent = activeEventId !== null;
  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    return products.filter(
      (product) =>
        (normalizedSearch.length === 0 ||
          product.name.toLocaleLowerCase('pt-BR').includes(normalizedSearch) ||
          product.categoryName.toLocaleLowerCase('pt-BR').includes(normalizedSearch)) &&
        (kind === 'all' || product.kind === kind) &&
        (categoryId === 'all' || product.categoryId === categoryId),
    );
  }, [categoryId, kind, products, search]);
  const activeProducts = products.filter((product) => product.active).length;
  const lowStockProducts = products.filter((product) => product.lowStock && product.active).length;
  const stockCostCents = [...administration.values()].reduce(
    (total, item) => total + item.currentStockValueCents,
    0,
  );
  const contributedCostCents = [...administration.values()].reduce(
    (total, item) => total + item.contributedCostCents,
    0,
  );

  return (
    <section className="feature-page">
      <header className="feature-header">
        <div>
          <span className="eyebrow">Catálogo global e saldo por evento</span>
          <h1>Estoque</h1>
          <p>
            Cadastre produtos, acompanhe o saldo real e diferencie valor atual de aporte líquido.
          </p>
        </div>
        <button
          className="button button--secondary"
          disabled={loading}
          onClick={() => void reload()}
          type="button"
        >
          <RefreshCw size={17} aria-hidden="true" />
          Atualizar
        </button>
      </header>
      <div className="summary-grid summary-grid--compact">
        <article className="summary-card">
          <span>Produtos ativos</span>
          <strong>{activeProducts}</strong>
        </article>
        <article
          className={lowStockProducts > 0 ? 'summary-card summary-card--warning' : 'summary-card'}
        >
          <span>Alertas de estoque</span>
          <strong>{lowStockProducts}</strong>
        </article>
        <article className="summary-card">
          <span>Valor atual em estoque</span>
          <strong>
            {production
              ? formatMoney(stockCostCents)
              : products.reduce((total, product) => total + product.quantity, 0)}
          </strong>
        </article>
        <article className="summary-card summary-card--accent">
          <span>{production ? 'Aporte líquido' : 'Evento selecionado'}</span>
          <strong>
            {production ? formatMoney(contributedCostCents) : hasActiveEvent ? 'Ativo' : 'Nenhum'}
          </strong>
        </article>
      </div>
      {!hasActiveEvent ? (
        <div className="inventory-warning">
          <TriangleAlert size={19} aria-hidden="true" />
          <span>Selecione um evento aberto para registrar entradas, perdas ou correções.</span>
        </div>
      ) : null}
      {error === null ? null : <p className="form-error">{error}</p>}
      {message === null ? null : <p className="form-success">{message}</p>}
      {production ? (
        <div className="inventory-admin-grid">
          <article className="panel form-panel">
            <div className="panel__heading">
              <PackagePlus size={20} aria-hidden="true" />
              <div>
                <h2>Novo produto</h2>
                <p>Foto é opcional; sem foto, você escolhe o ícone que aparecerá nas vendas.</p>
              </div>
            </div>
            {categories.length === 0 ? (
              <p className="inventory-helper">Crie uma categoria antes de cadastrar produtos.</p>
            ) : (
              <ProductForm busy={busy} categories={categories} onSubmit={createProduct} />
            )}
          </article>
          <article className="panel form-panel">
            <div className="panel__heading">
              <Boxes size={20} aria-hidden="true" />
              <div>
                <h2>Categorias</h2>
                <p>Organize alimentos e bebidas para o uso nas mesas.</p>
              </div>
            </div>
            <CategoryForm busy={busy} onSubmit={createCategory} />
            <div className="category-chips">
              {categories.map((category) => (
                <span key={category.id}>{category.name}</span>
              ))}
            </div>
          </article>
        </div>
      ) : null}
      <div className="inventory-toolbar">
        <label className="inventory-search">
          <Search size={17} aria-hidden="true" />
          <input
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            placeholder="Buscar produto ou categoria"
            value={search}
          />
        </label>
        <select
          aria-label="Filtrar por tipo"
          onChange={(event) => {
            setKind(event.target.value as ProductKind | 'all');
          }}
          value={kind}
        >
          <option value="all">Todos os tipos</option>
          <option value="drink">Bebidas</option>
          <option value="food">Comidas</option>
        </select>
        <select
          aria-label="Filtrar por categoria"
          onChange={(event) => {
            setCategoryId(event.target.value);
          }}
          value={categoryId}
        >
          <option value="all">Todas as categorias</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      <div className="inventory-list" aria-live="polite">
        {loading ? <div className="route-state">Carregando produtos…</div> : null}
        {!loading && filteredProducts.length === 0 ? (
          <div className="empty-state">
            <Boxes size={32} aria-hidden="true" />
            <h2>Nenhum produto encontrado</h2>
            <p>Cadastre o primeiro item ou ajuste os filtros.</p>
          </div>
        ) : null}
        {filteredProducts.map((product) => (
          <ProductCard
            busy={busy}
            categories={categories}
            hasActiveEvent={hasActiveEvent}
            key={product.id}
            onDelete={deleteProduct}
            onMovement={recordMovement}
            onPreviewDeletion={previewDeletion}
            onUpdate={updateProduct}
            presentation={administration.get(product.id)}
            product={product}
            production={production}
          />
        ))}
      </div>
      {production ? (
        <StockTransferSection
          activeEventId={activeEventId}
          onTransferred={reload}
          products={products}
        />
      ) : null}
      <ComboSection products={products} production={production} />
    </section>
  );
}
