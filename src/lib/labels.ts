export const BOOKING_STATUS_LABELS: Record<string, string> = {
  pending: "Ожидает",
  confirmed: "Подтверждено",
  cancelled: "Отменено",
};

export function bookingStatusLabel(status: string): string {
  return BOOKING_STATUS_LABELS[status] || status;
}

export function pluralize(n: number, one: string, few: string, many: string): string {
  const n10 = Math.abs(n) % 10;
  const n100 = Math.abs(n) % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

export function formatPrice(price: number | null | undefined): string {
  const value = Number(price || 0);
  return `${value.toLocaleString("ru-RU")} ₽`;
}
