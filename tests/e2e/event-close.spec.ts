import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import { _electron as electron } from 'playwright';

const applicationPath = path.join(process.cwd(), 'apps', 'desktop');

async function ensureProduction(window: Page): Promise<void> {
  if (await window.getByText('Caixa', { exact: true }).isVisible()) {
    await window.getByPlaceholder('Digite a senha').fill('121225');
    await window.getByRole('button', { name: 'Entrar em Produção' }).click();
    await expect(window.getByText('Produção', { exact: true })).toBeVisible();
  }
}

test('SMK-END-001 — concilia, gera backup e encerra o evento', async () => {
  test.setTimeout(60_000);
  const electronApplication = await electron.launch({ args: [applicationPath] });

  try {
    const window = await electronApplication.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await ensureProduction(window);
    const eventName = `Evento encerramento ${String(Date.now())}`;

    await window.getByRole('link', { name: 'Eventos' }).click();
    await window.getByPlaceholder('Ex.: La Rumba Neon — Agosto').fill(eventName);
    await window.getByRole('button', { name: 'Criar evento' }).click();
    const eventCard = window.locator('article.event-card').filter({ hasText: eventName });
    await expect(eventCard).toBeVisible();

    const operateButton = eventCard.getByRole('button', { name: 'Operar evento' });
    if (await operateButton.isVisible()) {
      await operateButton.click();
      await expect(eventCard.getByText('Em operação')).toBeVisible();
    }

    await window.getByRole('link', { name: 'Caixa' }).click();
    await window.getByLabel('Saldo de abertura').fill('100.00');
    await window.getByRole('button', { name: 'Abrir caixa' }).click();
    await expect(window.getByText('Caixa aberto.')).toBeVisible();

    await window.getByRole('link', { name: 'Eventos' }).click();
    await eventCard.getByRole('button', { name: 'Encerrar', exact: true }).click();
    const closePanel = window.locator('.event-close-panel');
    await expect(closePanel.getByRole('heading', { name: eventName })).toBeVisible();
    await expect(closePanel).toContainText('R$ 100,00');
    await closePanel.getByPlaceholder('0,00').fill('100,00');
    await closePanel.getByRole('checkbox').check();
    await closePanel.getByRole('button', { name: 'Encerrar evento com backup' }).click();

    const successMessage = window.getByText(/Evento encerrado\. Backup verificado:/u);
    const failureMessage = window.locator('.event-close-panel .form-error');
    const outcome = await Promise.race([
      successMessage.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'success' as const),
      failureMessage.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'failure' as const),
    ]);

    if (outcome === 'failure') {
      const failureText = (await failureMessage.textContent()) ?? 'erro não informado';
      throw new Error(`Encerramento rejeitado pelo sistema: ${failureText}`);
    }

    await expect(eventCard.getByText('Encerrado', { exact: true })).toBeVisible();
    await expect(window.getByText('Nenhum', { exact: true }).first()).toBeVisible();
  } finally {
    await electronApplication.close();
  }
});
