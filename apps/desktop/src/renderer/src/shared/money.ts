export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

export function parseMoneyInput(value: string): number {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.');
  const amount = Number(normalized);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Informe um valor monetário válido.');
  }

  return Math.round(amount * 100);
}
