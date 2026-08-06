import { expect, test } from '@playwright/test';

import {
  closeElectronApplication,
  ensureProduction,
  launchElectronApplication,
} from './electron-app';

test('SMK-NAV-002 — troca abas sem renderizar a tela intermediária de permissões', async () => {
  const electronApplication = await launchElectronApplication();

  try {
    const window = await electronApplication.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await ensureProduction(window);
    await window.getByRole('link', { name: 'Vouchers' }).click();
    await expect(window.getByRole('heading', { name: 'Vouchers', exact: true })).toBeVisible();

    await window.evaluate(() => {
      const observed: string[] = [];
      const collect = (): void => {
        const content = document.querySelector('.workspace-content')?.textContent ?? '';
        if (content.includes('Carregando permissões')) {
          observed.push('Carregando permissões');
        }
      };
      const observer = new MutationObserver(collect);
      const target = document.querySelector('.workspace-content');
      if (target !== null) {
        observer.observe(target, { childList: true, subtree: true, characterData: true });
      }
      Object.assign(window, { __gtrzPermissionFlashes: observed, __gtrzPermissionObserver: observer });
    });

    await window.getByRole('link', { name: 'Despesas' }).click();
    await expect(window.getByRole('heading', { name: 'Despesas', exact: true })).toBeVisible();
    await window.getByRole('link', { name: 'Auditoria' }).click();
    await expect(window.getByRole('heading', { name: 'Auditoria', exact: true })).toBeVisible();

    const flashes = await window.evaluate(() => {
      const observed = (window as unknown as { __gtrzPermissionFlashes?: string[] })
        .__gtrzPermissionFlashes;
      const observer = (window as unknown as { __gtrzPermissionObserver?: MutationObserver })
        .__gtrzPermissionObserver;
      observer?.disconnect();
      return observed ?? [];
    });
    expect(flashes).toEqual([]);
  } finally {
    await closeElectronApplication(electronApplication);
  }
});

test('SMK-VCH-002 — edita, aumenta, restringe por mesa e aplica manualmente', async () => {
  test.setTimeout(90_000);
  const electronApplication = await launchElectronApplication();

  try {
    const window = await electronApplication.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await ensureProduction(window);
    const suffix = String(Date.now());
    const eventName = `Evento gestão voucher ${suffix}`;
    const firstTable = `Mesa voucher A ${suffix.slice(-5)}`;
    const secondTable = `Mesa voucher B ${suffix.slice(-5)}`;
    const voucherCode = `VM-${suffix.slice(-8)}`;

    await window.getByRole('link', { name: 'Eventos' }).click();
    await window.getByPlaceholder('Ex.: La Rumba Neon — Agosto').fill(eventName);
    await window.getByRole('button', { name: 'Criar evento' }).click();
    await expect(window.getByText(eventName, { exact: true }).first()).toBeVisible();

    await window.getByRole('link', { name: 'Mesas e balcão' }).click();
    const tableInput = window.getByPlaceholder('Ex.: Mesa 12');
    await tableInput.fill(firstTable);
    await window.getByRole('button', { name: 'Criar mesa' }).click();
    await tableInput.fill(secondTable);
    await window.getByRole('button', { name: 'Criar mesa' }).click();
    await expect(window.getByRole('button', { name: new RegExp(firstTable, 'u') })).toBeVisible();
    await expect(window.getByRole('button', { name: new RegExp(secondTable, 'u') })).toBeVisible();

    await window.getByRole('link', { name: 'Vouchers' }).click();
    await window.getByPlaceholder('Ex.: Crédito patrocinador').fill(`Voucher ${suffix}`);
    await window.getByPlaceholder('Gerado automaticamente').fill(voucherCode);
    await window.getByPlaceholder('100,00').fill('10,00');
    await window.getByLabel('Mesa vinculada').selectOption({ label: firstTable });
    await window.getByRole('button', { name: 'Emitir voucher' }).click();
    const voucherCard = window.locator('article.voucher-card').filter({ hasText: voucherCode });
    await expect(voucherCard).toContainText(firstTable);
    await expect(voucherCard).toContainText('R$ 10,00');

    await voucherCard.getByRole('button', { name: 'Editar' }).click();
    await voucherCard.getByLabel('Mesa vinculada').selectOption({ label: secondTable });
    await voucherCard.getByLabel('Acréscimo de saldo').fill('5,00');
    await voucherCard.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(voucherCard).toContainText(secondTable);
    await expect(voucherCard).toContainText('R$ 15,00');

    await window.getByRole('link', { name: 'Mesas e balcão' }).click();
    await window.getByRole('button', { name: new RegExp(firstTable, 'u') }).click();
    const automaticVoucher = window.getByLabel('Voucher automático da mesa');
    await expect(automaticVoucher.locator('option')).toHaveCount(1);
    await window.getByPlaceholder('Digite ou leia o código').fill(voucherCode);
    await window.getByRole('button', { name: 'Aplicar código' }).click();
    await expect(window.getByText('aplicado manualmente', { exact: false })).toBeVisible();
    await window.getByRole('button', { name: 'Remover voucher da comanda' }).click();
    await window.getByRole('button', { name: 'Voltar para mesas' }).click();

    await window.getByRole('button', { name: new RegExp(secondTable, 'u') }).click();
    const secondAutomaticVoucher = window.getByLabel('Voucher automático da mesa');
    await expect(secondAutomaticVoucher.locator('option')).toHaveCount(2);
    await secondAutomaticVoucher.selectOption(voucherCode);
    await expect(window.getByText('vinculado a esta mesa', { exact: false })).toBeVisible();

    await window.getByRole('link', { name: 'Vouchers' }).click();
    const updatedCard = window.locator('article.voucher-card').filter({ hasText: voucherCode });
    await updatedCard.getByRole('button', { name: 'Excluir' }).click();
    await expect(updatedCard).toContainText('Ele ainda não foi usado em nenhuma venda paga.');
    await updatedCard.getByPlaceholder('Ex.: voucher criado por engano').fill('Teste de exclusão');
    await updatedCard.getByRole('button', { name: 'Excluir e estornar' }).click();
    await expect(updatedCard).toHaveCount(0);
  } finally {
    await closeElectronApplication(electronApplication);
  }
});
