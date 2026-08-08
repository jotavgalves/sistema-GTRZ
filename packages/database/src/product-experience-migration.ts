export const productExperienceMigration = {
  version: 20,
  name: 'product-media-and-cost-snapshots',
  sql: `
    ALTER TABLE products ADD COLUMN image_data_url TEXT;
    ALTER TABLE products ADD COLUMN fallback_icon TEXT NOT NULL DEFAULT 'package';
    ALTER TABLE stock_movements ADD COLUMN unit_cost_cents INTEGER CHECK (
      unit_cost_cents IS NULL OR unit_cost_cents >= 0
    );
  `,
} as const;
