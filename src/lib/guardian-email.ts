// Guardian email helpers (pure): normalize, validate and mask an address.

/** Trimmed and lower-cased (Supabase Auth stores emails lower-case). */
export function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

// One '@', no spaces, a dot in the domain with a 2+ letter last part.
const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[a-z]{2,}$/i

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL.test(value)
}

/**
 * j***@g***.com: first letter of the name, first letter of the domain, and the
 * last part of the domain. Never returns the full address.
 */
export function maskEmail(value: string | null | undefined): string {
  const email = normalizeEmail(value)
  const at = email.lastIndexOf('@')
  if (at < 1 || at === email.length - 1) return '***'
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  const dot = domain.lastIndexOf('.')
  const tld = dot > 0 ? domain.slice(dot) : ''
  return `${local[0]}***@${domain[0]}***${tld}`
}
