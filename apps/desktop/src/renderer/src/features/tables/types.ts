import type { OperationalCatalogItem } from '@gtrz/contracts';

export interface CartEntry {
  readonly item: OperationalCatalogItem;
  readonly quantity: number;
}
