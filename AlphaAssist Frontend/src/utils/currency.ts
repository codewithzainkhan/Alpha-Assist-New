/**
 * Format amount as Pakistani Rupee (PKR)
 */
export function formatPKR(amount: number): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Format amount as PKR without currency symbol (just number with "PKR" text)
 */
export function formatPKRSimple(amount: number): string {
  const formatted = new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
  return `PKR ${formatted}`
}

/**
 * Format amount as PKR with custom symbol
 */
export function formatPKRCustom(amount: number): string {
  const formatted = new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
  return `₨${formatted}`
}

