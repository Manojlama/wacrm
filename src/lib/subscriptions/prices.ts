// Lightweight helpers safe to import from client components.
// No server-only imports here.

export function formatPricePaise(paise: number, locale = "en-IN"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export function formatPriceInr(rupees: number, locale = "en-IN"): string {
  return formatPricePaise(Math.round(rupees * 100), locale);
}