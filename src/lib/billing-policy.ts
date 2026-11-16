// UTC anniversary months clamp the day, retaining the original billing anchor.
export function allowanceWindow(start: Date, end: Date, now: Date) {
  if (now < start || now >= end) return null;
  const anniversary = (offset: number) => {
    const date = new Date(start);
    date.setUTCDate(1);
    date.setUTCMonth(start.getUTCMonth() + offset);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(start.getUTCDate(), last));
    return date;
  };
  let index = (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + now.getUTCMonth() - start.getUTCMonth();
  if (anniversary(index) > now) index--;
  return { start: anniversary(index), end: new Date(Math.min(anniversary(index + 1).getTime(), end.getTime())) };
}

export function invoicePaymentVerified(invoice: {
  status: string | null; paid_out_of_band?: boolean; amount_due: number; amount_paid: number;
  total: number; subtotal: number; starting_balance: number; currency: string;
  total_discount_amounts?: unknown[] | null;
}, catalogAmount: number) {
  if (invoice.status !== "paid" || invoice.paid_out_of_band || invoice.currency !== "usd" ||
    invoice.subtotal !== catalogAmount || invoice.total < catalogAmount || invoice.total_discount_amounts?.length) return false;
  if (invoice.amount_due > 0) return invoice.amount_paid >= invoice.amount_due;
  // Fully applied existing Stripe customer cash/credit balance is valid settlement.
  // Free/discounted invoices, manual out-of-band settlement, and trials are not activation.
  return invoice.amount_due === 0 && invoice.total > 0 &&
    invoice.starting_balance < 0 && invoice.total + invoice.starting_balance <= 0;
}
