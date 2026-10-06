// Shared copy and helpers for the one screen (signup and first sign-in).
// No copy here names the age cutoff.
export const TOS_REQUIRED = 'You must accept the Terms of Service to continue.'
export const NAME_REQUIRED = 'Enter your name.'

export function toTitleCase(s: string) {
  return s.trim().replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
}
