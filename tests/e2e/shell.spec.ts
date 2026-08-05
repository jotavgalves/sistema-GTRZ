import path from 'node:path';

import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';

test('SMK-INF-002 — abre o GTRZ System com navegação modular', async () => {
  const applicationPath = path.join(process.cwd(), 'apps', 'desktop');
  const electronApplication = await electron.launch({ args: [applicationPath] });

  try {
    const window = await electronApplication.firstWindow();

    await expect(window.getByLabel('GTRZ System')).toBeVisible();
    await expect(window.getByRole('navigation', { name: 'Módulos do sistema' })).toBeVisible();
    await expect(window.getByRole('link', { name: 'Estoque' })).toBeVisible();
    await expect(window.getByRole('link', { name: 'Mesas e balcão' })).toBeVisible();
    await expect(window.getByText('Banco íntegro')).toBeVisible();
  } finally {
    await electronApplication.close();
  }
});
