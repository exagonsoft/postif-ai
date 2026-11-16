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

export function billingAnniversary(anchor: Date, offset: number, interval: "month" | "year") {
  const result = new Date(anchor);
  result.setUTCDate(1);
  result.setUTCMonth(anchor.getUTCMonth() + offset * (interval === "year" ? 12 : 1));
  const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(anchor.getUTCDate(), last));
  return result;
}
export function paidTransactionWindow(anchor: Date, paymentTime: Date, interval: "month" | "year", nextBilling?: Date) {
  if (!Number.isFinite(anchor.getTime()) || !Number.isFinite(paymentTime.getTime()) || paymentTime < anchor) return null;
  const months = (paymentTime.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + paymentTime.getUTCMonth() - anchor.getUTCMonth();
  let offset = Math.floor(months / (interval === "year" ? 12 : 1));
  if (billingAnniversary(anchor, offset, interval) > paymentTime) offset--;
  const start = billingAnniversary(anchor, offset, interval);
  let end = billingAnniversary(anchor, offset + 1, interval);
  if (nextBilling) {
    if (!Number.isFinite(nextBilling.getTime()) || nextBilling <= paymentTime ||
      nextBilling.getTime() - paymentTime.getTime() > (interval === "year" ? 366 : 31) * 86400000) return null;
    end = nextBilling;
  }
  return start <= paymentTime && paymentTime < end ? { start, end } : null;
}
