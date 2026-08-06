export const voucherManagementMigration = {
  version: 11,
  name: 'voucher-management',
  sql: `
    ALTER TABLE vouchers
      ADD COLUMN service_point_id TEXT
      REFERENCES service_points(id) ON UPDATE CASCADE ON DELETE RESTRICT;

    ALTER TABLE vouchers
      ADD COLUMN deleted_at INTEGER;

    CREATE INDEX vouchers_event_service_point_active_idx
      ON vouchers (event_id, service_point_id, updated_at DESC)
      WHERE deleted_at IS NULL;
  `,
} as const;
