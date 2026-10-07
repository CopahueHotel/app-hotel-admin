import type { Booking, CashMovement, Product, Sale } from './hotel-types';
import { remainingAmount } from '@/modules/shared/money';

const moneyFormat = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2,
});
export const currency = (cents: number) => moneyFormat.format(cents / 100);

export function bookingBalance(booking: Booking, sales: Sale[], cash: CashMovement[]) {
  const charges = sales.filter(s => s.booking === booking.id && s.account === null)
    .reduce((total, s) => total + s.amount, 0);
  const payments = cash.filter(m => m.ref === booking.id && m.kind === 'Cobro')
    .reduce((total, m) => total + m.amount, 0);
  return remainingAmount(booking.amount,charges,payments);
}

export const filterBookings = (bookings: Booking[], search: string) => bookings
  .filter(b => (b.guest + ' ' + b.room).toLowerCase().includes(search.toLowerCase()))
  .sort((a, b) => a.start.localeCompare(b.start));
export const filterProducts = (products: Product[], category: string) => products
  .filter(p => category === 'Todos' || p.category === category);
export function filterCash(cash: CashMovement[], filters: { date?: string; from?: string; to?: string; area?: string }) {
  return cash.filter(m => (!filters.date || m.date === filters.date)
    && (!filters.from || m.date >= filters.from) && (!filters.to || m.date <= filters.to)
    && (!filters.area || filters.area === 'Todo' || m.area === filters.area || m.area === 'Compartido'))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

type CsvCell = string | number;
export function serializeCsv(rows: CsvCell[][]) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    // Decimal comma matches Excel's Spanish locale with semicolon separators.
    let text = typeof value === 'number'
      ? value.toLocaleString('es-AR', { useGrouping: false, maximumFractionDigits: 12 }) : value;
    if (typeof value === 'string' && /^\s*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  }).join(';')).join('\r\n');
}
