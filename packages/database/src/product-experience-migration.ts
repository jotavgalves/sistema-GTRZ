import type BetterSqlite3 from 'better-sqlite3';

const productExperienceMigration = {
  version: 20,
  name: 'product-presentation-and-stock-cost-ledger',
} as const;

export function ensureProductExperienceSchema(sqlite: BetterSqlite3.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS product_presentations (
      product_id TEXT PRIMARY KEY NOT NULL,
      image_data_url TEXT,
      fallback_icon TEXT NOT NULL DEFAULT 'package' CHECK (fallback_icon IN (
        'package', 'beer', 'cup-soda', 'coffee', 'sandwich', 'pizza',
        'ice-cream', 'glass-water', 'candy'
      )),
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS stock_cost_ledger (
      movement_id TEXT PRIMARY KEY NOT NULL,
      event_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      delta_cents INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (movement_id) REFERENCES stock_movements(id) ON UPDATE CASCADE ON DELETE CASCADE,
      FOREIGN KEY (event_id) REFERENCES events(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      FOREIGN KEY (product_id) REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS stock_cost_ledger_event_product_idx
      ON stock_cost_ledger (event_id, product_id, created_at);

    INSERT OR IGNORE INTO product_presentations
      (product_id, image_data_url, fallback_icon, updated_at)
    SELECT id, NULL, 'package', updated_at FROM products;

    INSERT OR IGNORE INTO stock_cost_ledger
      (movement_id, event_id, product_id, delta_cents, created_at)
    SELECT
      sm.id,
      sm.event_id,
      sm.product_id,
      CASE sm.type
        WHEN 'purchase' THEN sm.quantity * p.cost_cents
        WHEN 'correction-positive' THEN sm.quantity * p.cost_cents
        WHEN 'correction-negative' THEN -sm.quantity * p.cost_cents
        ELSE 0
      END,
      sm.created_at
    FROM stock_movements sm
    INNER JOIN products p ON p.id = sm.product_id
    WHERE sm.type IN ('purchase', 'correction-positive', 'correction-negative');

    CREATE TRIGGER IF NOT EXISTS stock_cost_ledger_after_stock_movement
    AFTER INSERT ON stock_movements
    WHEN NEW.type IN ('purchase', 'correction-positive', 'correction-negative')
    BEGIN
      INSERT OR REPLACE INTO stock_cost_ledger
        (movement_id, event_id, product_id, delta_cents, created_at)
      SELECT
        NEW.id,
        NEW.event_id,
        NEW.product_id,
        CASE NEW.type
          WHEN 'purchase' THEN NEW.quantity * p.cost_cents
          WHEN 'correction-positive' THEN NEW.quantity * p.cost_cents
          WHEN 'correction-negative' THEN -NEW.quantity * p.cost_cents
          ELSE 0
        END,
        NEW.created_at
      FROM products p
      WHERE p.id = NEW.product_id;
    END;
  `);

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO schema_migrations (version, name, applied_at)
       VALUES (?, ?, ?)`,
    )
    .run(productExperienceMigration.version, productExperienceMigration.name, Date.now());
}
