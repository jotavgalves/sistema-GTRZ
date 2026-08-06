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

test('SMK-TKT-001 — vende grupo, gera códigos e cancela com reflexo no caixa', async () => {
  const electronApplication = await electron.launch({ args: [applicationPath] });

  try {
    const window = await electronApplication.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await ensureProduction(window);
    const suffix = String(Date.now());
    const eventName = `Evento ingresso ${suffix}`;
    const lotName = `Lote ${suffix.slice(-6)}`;
    const attendeeName = `Grupo ${suffix.slice(-6)}`;

    await window.getByRole('link', { name: 'Eventos' }).click();
    await window.getByPlaceholder('Ex.: La Rumba Neon — Agosto').fill(eventName);
    await window.getByRole('button', { name: 'Criar evento' }).click();
    await expect(window.getByText(eventName, { exact: true }).first()).toBeVisible();

    await window.getByRole('link', { name: 'Ingressos' }).click();
    await expect(window.getByRole('heading', { name: 'Ingressos' })).toBeVisible();
    await window.getByPlaceholder('Ex.: Segundo lote').fill(lotName);
    await window.getByPlaceholder('60,00').fill('50.00');
    await window.getByPlaceholder('200').fill('3');
    await window.getByRole('button', { name: 'Criar lote' }).click();
    await expect(window.getByText('Lote criado.')).toBeVisible();

    await window.getByLabel('Lote').selectOption({ label: `${lotName} · 3 disponíveis` });
    await window.getByPlaceholder('Nome completo').fill(attendeeName);
    await window.getByLabel('Origem').selectOption('door');
    await window.getByLabel('Quantidade').fill('2');
    await window.getByLabel('Pagamento').selectOption('cash');
    await window.getByRole('button', { name: 'Registrar venda' }).click();
    await expect(window.getByText('Ingressos registrados.')).toBeVisible();

    const saleCard = window.locator('article.ticket-sale-card').filter({ hasText: attendeeName });
    await expect(saleCard).toContainText('R$ 100,00');
    await expect(saleCard.locator('.ticket-code')).toHaveCount(2);
    const lotCard = window.locator('article.ticket-lot-card').filter({ hasText: lotName });
    await expect(lotCard).toContainText('1');

    await window.getByRole('link', { name: 'Caixa' }).click();
    await expect(window.getByText('R$ 100,00', { exact: true }).first()).toBeVisible();

    await window.getByRole('link', { name: 'Ingressos' }).click();
    const activeSaleCard = window
      .locator('article.ticket-sale-card')
      .filter({ hasText: attendeeName });
    await activeSaleCard.getByPlaceholder('Ex.: venda duplicada').fill('Venda duplicada');
    await activeSaleCard.getByRole('button', { name: 'Cancelar venda' }).click();
    await expect(window.getByText('Venda cancelada.')).toBeVisible();
    await expect(activeSaleCard).toContainText('Cancelada');
    await expect(lotCard).toContainText('3');

    await window.getByRole('link', { name: 'Caixa' }).click();
    await expect(window.getByText('R$ 0,00', { exact: true }).first()).toBeVisible();
  } finally {
    await electronApplication.close();
  }
});
