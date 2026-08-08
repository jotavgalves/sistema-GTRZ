import { ChevronDown, History, RotateCcw } from 'lucide-react';

import type { Order } from '@gtrz/contracts';

import { CancellationForm } from './CancellationForm';

interface RecentOrdersPanelProps { readonly orders: readonly Order[]; readonly busy: boolean; readonly onCancel: (orderId: string, reason: string) => Promise<void>; readonly title?: string; }
function formatMoney(cents: number): string { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100); }
function formatDate(timestamp: number | null): string { return timestamp === null ? 'Sem horário de fechamento' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(timestamp); }

export function RecentOrdersPanel({ orders, busy, onCancel, title = 'Histórico de vendas' }: RecentOrdersPanelProps): React.JSX.Element {
  return <details className="history-drawer"><summary><span><History size={18} aria-hidden="true" /><strong>{title}</strong><small>{orders.length} registro(s)</small></span><ChevronDown size={18} aria-hidden="true" /></summary><div className="history-drawer__content">{orders.length === 0 ? <p className="operation-empty">Nenhuma venda concluída.</p> : <div className="recent-order-list">{orders.map((order) => <article className="recent-order-card" key={order.id}><div className="recent-order-card__summary"><span><strong>{order.servicePointLabel}</strong><small>{formatDate(order.closedAt)}</small></span><span className={order.status === 'cancelled' ? 'status-badge status-badge--archived' : 'status-badge status-badge--open'}>{order.status === 'cancelled' ? 'Cancelada' : 'Paga'}</span><strong>{formatMoney(order.totalCents)}</strong></div><p className="recent-order-card__items">{order.items.map((item) => `${String(item.quantity)}× ${item.itemName}`).join(' · ')}</p>{order.status === 'paid' ? <div className="recent-order-card__cancel"><RotateCcw size={18} aria-hidden="true" /><CancellationForm busy={busy} label="Estornar venda" onSubmit={(reason) => onCancel(order.id, reason)} /></div> : null}</article>)}</div>}</div></details>;
}
