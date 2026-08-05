import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const schemaMigrations = sqliteTable('schema_migrations', {
  version: integer('version').primaryKey(),
  name: text('name').notNull(),
  appliedAt: integer('applied_at', { mode: 'timestamp_ms' }).notNull(),
});

export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  status: text('status', { enum: ['open', 'closed', 'archived'] }).notNull(),
  startsAt: integer('starts_at', { mode: 'timestamp_ms' }).notNull(),
  endsAt: integer('ends_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const productCategories = sqliteTable('product_categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  categoryId: text('category_id')
    .notNull()
    .references(() => productCategories.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['food', 'drink'] }).notNull(),
  costCents: integer('cost_cents').notNull(),
  salePriceCents: integer('sale_price_cents').notNull(),
  lowStockThreshold: integer('low_stock_threshold').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const eventStock = sqliteTable(
  'event_stock',
  {
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    quantity: integer('quantity').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.productId] })],
);

export const stockMovements = sqliteTable('stock_movements', {
  id: text('id').primaryKey(),
  eventId: text('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  productId: text('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  type: text('type', {
    enum: [
      'purchase',
      'correction-positive',
      'correction-negative',
      'loss',
      'breakage',
      'internal-consumption',
      'courtesy',
      'return',
      'sale',
      'sale-cancel',
    ],
  }).notNull(),
  quantity: integer('quantity').notNull(),
  delta: integer('delta').notNull(),
  note: text('note'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const stockTransfers = sqliteTable('stock_transfers', {
  id: text('id').primaryKey(),
  productId: text('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  productName: text('product_name').notNull(),
  sourceEventId: text('source_event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  sourceEventName: text('source_event_name').notNull(),
  destinationEventId: text('destination_event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  destinationEventName: text('destination_event_name').notNull(),
  quantity: integer('quantity').notNull(),
  note: text('note'),
  sourceQuantityBefore: integer('source_quantity_before').notNull(),
  sourceQuantityAfter: integer('source_quantity_after').notNull(),
  destinationQuantityBefore: integer('destination_quantity_before').notNull(),
  destinationQuantityAfter: integer('destination_quantity_after').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const combos = sqliteTable('combos', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  salePriceCents: integer('sale_price_cents').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const comboComponents = sqliteTable(
  'combo_components',
  {
    comboId: text('combo_id')
      .notNull()
      .references(() => combos.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    quantity: integer('quantity').notNull(),
  },
  (table) => [primaryKey({ columns: [table.comboId, table.productId] })],
);

export const saleTables = sqliteTable('sale_tables', {
  id: text('id').primaryKey(),
  eventId: text('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['counter', 'table'] }).notNull(),
  status: text('status', { enum: ['open', 'closed'] }).notNull(),
  openedAt: integer('opened_at', { mode: 'timestamp_ms' }).notNull(),
  closedAt: integer('closed_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const cashSessions = sqliteTable('cash_sessions', {
  id: text('id').primaryKey(),
  eventId: text('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  status: text('status', { enum: ['open', 'closed'] }).notNull(),
  openingFloatCents: integer('opening_float_cents').notNull(),
  countedClosingCents: integer('counted_closing_cents'),
  openedAt: integer('opened_at', { mode: 'timestamp_ms' }).notNull(),
  closedAt: integer('closed_at', { mode: 'timestamp_ms' }),
});

export const vouchers = sqliteTable('vouchers', {
  id: text('id').primaryKey(),
  eventId: text('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  code: text('code').notNull(),
  origin: text('origin', { enum: ['pre-sale', 'local-sale', 'courtesy'] }).notNull(),
  status: text('status', { enum: ['active', 'depleted', 'cancelled'] }).notNull(),
  initialBalanceCents: integer('initial_balance_cents').notNull(),
  balanceCents: integer('balance_cents').notNull(),
  tableId: text('table_id').references(() => saleTables.id, {
    onDelete: 'set null',
    onUpdate: 'cascade',
  }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const sales = sqliteTable('sales', {
  id: text('id').primaryKey(),
  eventId: text('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  tableId: text('table_id')
    .notNull()
    .references(() => saleTables.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  tableName: text('table_name').notNull(),
  status: text('status', { enum: ['paid', 'cancelled'] }).notNull(),
  totalCents: integer('total_cents').notNull(),
  changeCents: integer('change_cents').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  cancelledAt: integer('cancelled_at', { mode: 'timestamp_ms' }),
  cancellationReason: text('cancellation_reason'),
});

export const saleLines = sqliteTable('sale_lines', {
  id: text('id').primaryKey(),
  saleId: text('sale_id')
    .notNull()
    .references(() => sales.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  itemKind: text('item_kind', { enum: ['product', 'combo'] }).notNull(),
  itemId: text('item_id').notNull(),
  itemName: text('item_name').notNull(),
  quantity: integer('quantity').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
  totalPriceCents: integer('total_price_cents').notNull(),
});

export const salePayments = sqliteTable('sale_payments', {
  id: text('id').primaryKey(),
  saleId: text('sale_id')
    .notNull()
    .references(() => sales.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  method: text('method', { enum: ['card', 'pix', 'cash', 'voucher'] }).notNull(),
  amountCents: integer('amount_cents').notNull(),
  voucherId: text('voucher_id').references(() => vouchers.id, {
    onDelete: 'restrict',
    onUpdate: 'cascade',
  }),
  voucherCode: text('voucher_code'),
});

export const voucherMovements = sqliteTable('voucher_movements', {
  id: text('id').primaryKey(),
  voucherId: text('voucher_id')
    .notNull()
    .references(() => vouchers.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  eventId: text('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  type: text('type', {
    enum: ['issue', 'redeem', 'refund', 'cancel', 'reactivate'],
  }).notNull(),
  amountCents: integer('amount_cents').notNull(),
  balanceBeforeCents: integer('balance_before_cents').notNull(),
  balanceAfterCents: integer('balance_after_cents').notNull(),
  saleId: text('sale_id').references(() => sales.id, {
    onDelete: 'restrict',
    onUpdate: 'cascade',
  }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const cashMovements = sqliteTable('cash_movements', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => cashSessions.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  eventId: text('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  type: text('type', {
    enum: ['opening', 'supply', 'withdrawal', 'sale', 'refund', 'expense', 'expense-reversal'],
  }).notNull(),
  method: text('method', { enum: ['card', 'pix', 'cash'] }),
  amountCents: integer('amount_cents').notNull(),
  note: text('note'),
  sourceId: text('source_id'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const expenseCategories = sqliteTable('expense_categories', {
  id: text('id').primaryKey(),
  eventId: text('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const expenses = sqliteTable('expenses', {
  id: text('id').primaryKey(),
  eventId: text('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  categoryId: text('category_id')
    .notNull()
    .references(() => expenseCategories.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  description: text('description').notNull(),
  totalCents: integer('total_cents').notNull(),
  dueAt: integer('due_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const expensePayments = sqliteTable('expense_payments', {
  id: text('id').primaryKey(),
  expenseId: text('expense_id')
    .notNull()
    .references(() => expenses.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  sessionId: text('session_id')
    .notNull()
    .references(() => cashSessions.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  method: text('method', { enum: ['card', 'pix', 'cash'] }).notNull(),
  amountCents: integer('amount_cents').notNull(),
  note: text('note'),
  paidAt: integer('paid_at', { mode: 'timestamp_ms' }).notNull(),
  reversedAt: integer('reversed_at', { mode: 'timestamp_ms' }),
});

export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: text('event_id'),
  profile: text('profile', { enum: ['production', 'cashier'] }).notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  detailsJson: text('details_json').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const technicalSchema = {
  appMeta,
  auditLog,
  cashMovements,
  cashSessions,
  comboComponents,
  combos,
  eventStock,
  events,
  expenseCategories,
  expensePayments,
  expenses,
  productCategories,
  products,
  saleLines,
  salePayments,
  saleTables,
  sales,
  schemaMigrations,
  stockMovements,
  stockTransfers,
  voucherMovements,
  vouchers,
};
