import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { technicalSchema } from './schema';
import type { DatabaseContext } from './types';

interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'technical-foundation',
    sql: `
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: 'events-profiles-and-audit',
    sql: `
      CREATE TABLE events (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('open', 'closed', 'archived')),
        starts_at INTEGER NOT NULL,
        ends_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX events_status_starts_at_idx
        ON events (status, starts_at DESC);

      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        event_id TEXT,
        profile TEXT NOT NULL CHECK (profile IN ('production', 'cashier')),
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        details_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (event_id) REFERENCES events(id) ON UPDATE CASCADE ON DELETE RESTRICT
      );

      CREATE INDEX audit_log_event_created_at_idx
        ON audit_log (event_id, created_at DESC);
      CREATE INDEX audit_log_action_created_at_idx
        ON audit_log (action, created_at DESC);
    `,
  },
  {
    version: 3,
    name: 'product-catalog-and-event-stock',
    sql: `
      CREATE TABLE product_categories (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE products (
        id TEXT PRIMARY KEY NOT NULL,
        category_id TEXT NOT NULL,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        kind TEXT NOT NULL CHECK (kind IN ('food', 'drink')),
        cost_cents INTEGER NOT NULL CHECK (cost_cents >= 0),
        sale_price_cents INTEGER NOT NULL CHECK (sale_price_cents >= 0),
        low_stock_threshold INTEGER NOT NULL CHECK (low_stock_threshold >= 0),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (category_id) REFERENCES product_categories(id)
          ON UPDATE CASCADE ON DELETE RESTRICT
      );

      CREATE INDEX products_category_name_idx
        ON products (category_id, name COLLATE NOCASE);

      CREATE TABLE event_stock (
        event_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (event_id, product_id),
        FOREIGN KEY (event_id) REFERENCES events(id)
          ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (product_id) REFERENCES products(id)
          ON UPDATE CASCADE ON DELETE RESTRICT
      );

      CREATE TABLE stock_movements (
        id TEXT PRIMARY KEY NOT NULL,
        event_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN (
          'purchase',
          'correction-positive',
          'correction-negative',
          'loss',
          'breakage',
          'internal-consumption',
          'courtesy',
          'return'
        )),
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        delta INTEGER NOT NULL CHECK (delta != 0),
        note TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (event_id) REFERENCES events(id)
          ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (product_id) REFERENCES products(id)
          ON UPDATE CASCADE ON DELETE RESTRICT
      );

      CREATE INDEX stock_movements_event_created_idx
        ON stock_movements (event_id, created_at DESC);
      CREATE INDEX stock_movements_product_created_idx
        ON stock_movements (product_id, created_at DESC);
    `,
  },
  {
    version: 4,
    name: 'product-combos',
    sql: `
      CREATE TABLE combos (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        sale_price_cents INTEGER NOT NULL CHECK (sale_price_cents >= 0),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE combo_components (
        combo_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        PRIMARY KEY (combo_id, product_id),
        FOREIGN KEY (combo_id) REFERENCES combos(id)
          ON UPDATE CASCADE ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
          ON UPDATE CASCADE ON DELETE RESTRICT
      );

      CREATE INDEX combo_components_product_idx
        ON combo_components (product_id);
    `,
  },
  {
    version: 5,
    name: 'stock-transfers-between-events',
    sql: `
      CREATE TABLE stock_transfers (
        id TEXT PRIMARY KEY NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        source_event_id TEXT NOT NULL,
        source_event_name TEXT NOT NULL,
        destination_event_id TEXT NOT NULL,
        destination_event_name TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        note TEXT,
        source_quantity_before INTEGER NOT NULL CHECK (source_quantity_before >= 0),
        source_quantity_after INTEGER NOT NULL CHECK (source_quantity_after >= 0),
        destination_quantity_before INTEGER NOT NULL CHECK (destination_quantity_before >= 0),
        destination_quantity_after INTEGER NOT NULL CHECK (destination_quantity_after >= 0),
        created_at INTEGER NOT NULL,
        CHECK (source_event_id != destination_event_id),
        FOREIGN KEY (product_id) REFERENCES products(id)
          ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (source_event_id) REFERENCES events(id)
          ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (destination_event_id) REFERENCES events(id)
          ON UPDATE CASCADE ON DELETE RESTRICT
      );

      CREATE INDEX stock_transfers_source_created_idx
        ON stock_transfers (source_event_id, created_at DESC);
      CREATE INDEX stock_transfers_destination_created_idx
        ON stock_transfers (destination_event_id, created_at DESC);
      CREATE INDEX stock_transfers_product_created_idx
        ON stock_transfers (product_id, created_at DESC);
    `,
  },
  {
    version: 6,
    name: 'event-operations-sales-vouchers-cash-expenses',
    sql: `
      ALTER TABLE stock_movements RENAME TO stock_movements_legacy;

      CREATE TABLE stock_movements (
        id TEXT PRIMARY KEY NOT NULL,
        event_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN (
          'purchase',
          'correction-positive',
          'correction-negative',
          'loss',
          'breakage',
          'internal-consumption',
          'courtesy',
          'return',
          'sale',
          'sale-cancel'
        )),
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        delta INTEGER NOT NULL CHECK (delta != 0),
        note TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (event_id) REFERENCES events(id)
          ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (product_id) REFERENCES products(id)
          ON UPDATE CASCADE ON DELETE RESTRICT
      );

      INSERT INTO stock_movements
      (id, event_id, product_id, type, quantity, delta, note, created_at)
      SELECT id, event_id, product_id, type, quantity, delta, note, created_at
      FROM stock_movements_legacy;

      DROP TABLE stock_movements_legacy;

      CREATE INDEX stock_movements_event_created_idx
        ON stock_movements (event_id, created_at DESC);
      CREATE INDEX stock_movements_product_created_idx
        ON stock_movements (product_id, created_at DESC);

      CREATE TABLE sale_tables (
        id TEXT PRIMARY KEY NOT NULL,
        event_id TEXT NOT NULL,
        name TEXT NOT NULL COLLATE NOCASE,
        kind TEXT NOT NULL CHECK (kind IN ('counter', 'table')),
        status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
        opened_at INTEGER NOT NULL,
        closed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (event_id, name),
        FOREIGN KEY (event_id) REFERENCES events(id)
          ON UPDATE CASCADE ON DELETE RESTRICT
      );

      CREATE INDEX sale_tables_event_status_idx
        ON sale_tables (event_id, status, name COLLATE NOCASE);

      CREATE TABLE cash_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        event_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
        opening_float_cents INTEGER NOT NULL CHECK (opening_float_cents >= 0),
        counted_closing_cents INTEGER CHECK (counted_closing_cents >= 0),
        opened_at INTEGER NOT NULL,
        closed_at INTEGER,
        FOREIGN KEY (event_id) REFERENCES events(id)
          ON UPDATE CASCADE ON DELETE RESTRICT
      );

      CREATE UNIQUE INDEX cash_sessions_one_open_per_event_idx
        ON cash_sessions (event_id) WHERE status = 'open';

      CREATE TABLE vouchers (
        id TEXT PRIMARY KEY NOT NULL,
        event_id TEXT NOT NULL,
        code TEXT NOT NULL COLLATE NOCASE,
        origin TEXT NOT NULL CHECK (origin IN ('pre-sale', 'local-sale', 'courtesy')),
        status TEXT NOT NULL CHECK (status IN ('active', 'depleted', 'cancelled')),
        initial_balance_cents INTEGER NOT NULL CHECK (initial_balance_cents > 0),
        balance_cents INTEGER NOT NULL CHECK (balance_cents >= 0),
        table_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (event_id, code),
        FOREIGN KEY (event_id) REFERENCES events(id)
          ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (table_id) REFERENCES sale_tables(id)
          ON UPDATE CASCADE ON DELETE SET NULL
      );

      CREATE TABLE sales (
        id TEXT PRIMARY KEY NOT NULL,
        event_id TEXT NOT NULL,
        table_id TEXT NOT NULL,
        table_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('paid', 'cancelled')),
        total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
        change_cents INTEGER NOT NULL DEFAULT 0 CHECK (change_cents >= 0),
        created_at INTEGER NOT NULL,
        cancelled_at INTEGER,
        cancellation_reason TEXT,
        FOREIGN KEY (event_id) REFERENCES events(id)
          ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (table_id) REFERENCES sale_tables(id)
          ON UPDATE CASCADE ON DELETE RESTRICT
      );

      CREATE INDEX sales_event_created_idx
        ON sales (event_id, created_at DESC);
      CREATE INDEX sales_table_created_idx
        ON sales (table_id, created_at DESC);

      CREATE TABLE sale_lines (
        id TEXT PRIMARY KEY NOT NULL,
        sale_id TEXT NOT NULL,
        item_kind TEXT NOT NULL CHECK (item_kind IN ('product', 'combo')),
        item_id TEXT NOT NULL,
        item_name TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
        total_price_cents INTEGER NOT NULL CHECK (total_price_cents >= 0),
        FOREIGN KEY (sale_id) REFERENCES sales(id)
          ON UPDATE CASCADE ON DELETE CASCADE
      );

      CREATE TABLE sale_payments (
        id TEXT PRIMARY KEY NOT NULL,
        sale_id TEXT NOT NULL,
        method TEXT NOT NULL CHECK (method IN ('card', 'pix', 'cash', 'voucher')),
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        voucher_id TEXT,
        voucher_code TEXT,
        FOREIGN KEY (sale_id) REFERENCES sales(id)
          ON UPDATE CASCADE ON DELETE CASCADE,
        FOREIGN KEY (voucher_id) REFERENCES vouchers(id)
          ON UPDATE CASCADE ON DELETE RESTRICT
      );

      CREATE TABLE voucher_movements (
        id TEXT PRIMARY KEY NOT NULL,
        voucher_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('issue', 'redeem', 'refund', 'cancel', 'reactivate')),
        amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
        balance_before_cents INTEGER NOT NULL CHECK (balance_before_cents >= 0),
        balance_after_cents INTEGER NOT NULL CHECK (balance_after_cents >= 0),
        sale_id TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (voucher_id) REFERENCES vouchers(id)
          ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (event_id) REFERENCES events(id)
          ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (sale_id) REFERENCES sales(id)
          ON UPDATE CASCADE ON DELETE RESTRICT
      );

      CREATE INDEX voucher_movements_voucher_created_idx
        ON voucher_movements (voucher_id, created_at DESC);

      CREATE TABLE cash_movements (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN (
          'opening',
          'supply',
          'withdrawal',
          'sale',
          'refund',
          'expense',
          'expense-reversal'
        )),
        method TEXT CHECK (method IN ('card', 'pix', 'cash')),
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        note TEXT,
        source_id TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES cash_sessions(id)
          ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (event_id) REFERENCES events(id)
          ON UPDATE CASCADE ON DELETE RESTRICT
      );

      CREATE INDEX cash_movements_session_created_idx
        ON cash_movements (session_id, created_at DESC);

      CREATE TABLE expense_categories (
        id TEXT PRIMARY KEY NOT NULL,
        event_id TEXT NOT NULL,
        name TEXT NOT NULL COLLATE NOCASE,
        created_at INTEGER NOT NULL,
        UNIQUE (event_id, name),
        FOREIGN KEY (event_id) REFERENCES events(id)
          ON UPDATE CASCADE ON DELETE RESTRICT
      );

      CREATE TABLE expenses (
        id TEXT PRIMARY KEY NOT NULL,
        event_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        description TEXT NOT NULL,
        total_cents INTEGER NOT NULL CHECK (total_cents > 0),
        due_at INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (event_id) REFERENCES events(id)
          ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (category_id) REFERENCES expense_categories(id)
          ON UPDATE CASCADE ON DELETE RESTRICT
      );

      CREATE INDEX expenses_event_created_idx
        ON expenses (event_id, created_at DESC);

      CREATE TABLE expense_payments (
        id TEXT PRIMARY KEY NOT NULL,
        expense_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        method TEXT NOT NULL CHECK (method IN ('card', 'pix', 'cash')),
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        note TEXT,
        paid_at INTEGER NOT NULL,
        reversed_at INTEGER,
        FOREIGN KEY (expense_id) REFERENCES expenses(id)
          ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (session_id) REFERENCES cash_sessions(id)
          ON UPDATE CASCADE ON DELETE RESTRICT
      );

      CREATE INDEX expense_payments_expense_paid_idx
        ON expense_payments (expense_id, paid_at DESC);
    `,
  },
];

function ensureMigrationTable(sqlite: BetterSqlite3.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);
}

function applyMigrations(sqlite: BetterSqlite3.Database): void {
  ensureMigrationTable(sqlite);

  const hasMigration = sqlite.prepare('SELECT 1 FROM schema_migrations WHERE version = ?');
  const registerMigration = sqlite.prepare(
    'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
  );

  const migrate = sqlite.transaction(() => {
    for (const migration of migrations) {
      if (hasMigration.get(migration.version) !== undefined) {
        continue;
      }

      sqlite.exec(migration.sql);
      registerMigration.run(migration.version, migration.name, Date.now());
    }
  });

  migrate();
}

export function openDatabase(filePath: string): DatabaseContext {
  const sqlite = new BetterSqlite3(filePath);

  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');

  applyMigrations(sqlite);

  const orm = drizzle(sqlite, { schema: technicalSchema });

  return {
    sqlite,
    orm,
    filePath,
    close(): void {
      if (sqlite.open) {
        sqlite.close();
      }
    },
  };
}

export function verifyDatabaseIntegrity(database: DatabaseContext): boolean {
  const result = database.sqlite.pragma('quick_check', { simple: true });
  return result === 'ok';
}

export * from './audit';
export * from './backup';
export * from './cash';
export * from './combos';
export * from './control';
export * from './expenses';
export * from './inventory';
export * from './operations';
export * from './stock-transfers';
export * from './vouchers';
export type { DatabaseContext } from './types';
