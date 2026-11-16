export function hasPayPalPlanLineBreaks(value: string) {
  return /[\r\n\u0085\u2028\u2029]/.test(value);
}

export function normalizePayPalPlanDescription(value: string) {
  return value.replace(/[\r\n\u0085\u2028\u2029]+/g, " ").trim();
}
