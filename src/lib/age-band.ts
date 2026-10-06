// Age bands (migration 037) and the age screen's rules. Pure: used by client
// components, server actions and tests.
//
//   * Bands: 'under_13' | '13_17' | '18_plus'. NULL = unknown.
//   * The player answers with birth month and year (spec T1). We turn that
//     into a band right away and never store the month or year.
//   * The coach answers with a band. When answers differ, the YOUNGER band
//     wins (spec T2), and an under-13 age group ("Youth 10-12", "12U") counts
//     as an under-13 answer (grade ranges like "9-12" don't; migration 039). The plain age group "Youth" (no numbers)
//     counts as under 13 only when no band is known from the coach or the
//     player. Migration 037's players_set_age_band trigger does
//     the same; the database result is the one stored.

export const AGE_BANDS = ['under_13', '13_17', '18_plus'] as const
export type AgeBand = (typeof AGE_BANDS)[number]
export type AgeBandSource = 'coach' | 'self' | 'age_group'

export const AGE_BAND_LABELS: Record<AgeBand, string> = {
  under_13: 'Under 13',
  '13_17': '13 to 17',
  '18_plus': '18 or older',
}

export function isAgeBand(value: unknown): value is AgeBand {
  return typeof value === 'string' && (AGE_BANDS as readonly string[]).includes(value)
}

const RANK: Record<AgeBand, number> = { under_13: 1, '13_17': 2, '18_plus': 3 }

/** The younger of the bands given (ignores null/unknown values); null if none. */
export function youngerBand(...bands: (string | null | undefined)[]): AgeBand | null {
  let out: AgeBand | null = null
  for (const b of bands) if (isAgeBand(b) && (out === null || RANK[b] < RANK[out])) out = b
  return out
}

/**
 * True for an under-13 age group: a U-number group ("U8" to "U12", "12U",
 * "under 12") or an age range with the word "Youth" ("Youth 10-12"). A bare
 * range ("9-12", "8 to 10") doesn't count: it usually means grades.
 * Same rule as public.age_group_is_under_13 (migration 039).
 */
export function ageGroupIsUnder13(group: string | null | undefined): boolean {
  const g = (group ?? '').toLowerCase()
  let m = g.match(/(?:^|[^a-z0-9])(?:u|under)\s*-?\s*(\d{1,2})(?:[^0-9]|$)/)
  if (m && Number(m[1]) <= 12) return true
  m = g.match(/(?:^|[^0-9])(\d{1,2})\s*-?\s*u(?:[^a-z]|$)/)
  if (m && Number(m[1]) <= 12) return true
  if (/(^|[^a-z])youth([^a-z]|$)/.test(g)) {
    m = g.match(/(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})/)
    if (m && Number(m[2]) <= 12) return true
  }
  return false
}

/**
 * True for the plain age group "Youth" with no age range or numbers in it.
 * The app's age-group lists put Youth before Middle School, so it's treated
 * as under 13, but only when no band is known (see effectiveAgeBand).
 * Same rule as public.age_group_is_plain_youth (037).
 */
export function ageGroupIsPlainYouth(group: string | null | undefined): boolean {
  const g = (group ?? '').toLowerCase()
  return /(^|[^a-z])youth([^a-z]|$)/.test(g) && !/[0-9]/.test(g)
}

/**
 * The effective band, as 037's trigger works it out: the younger of the
 * player's and the coach's answers (the coach's wins a tie), then under_13
 * if any age group is under 13 ("Youth 10-12", "12U"), or, when no band
 * is known at all, the plain age group "Youth".
 */
export function effectiveAgeBand(input: {
  coach?: string | null
  self?: string | null
  ageGroups?: (string | null | undefined)[]
}): { band: AgeBand | null; source: AgeBandSource | null } {
  const coach = isAgeBand(input.coach) ? input.coach : null
  const self = isAgeBand(input.self) ? input.self : null
  let band: AgeBand | null = null
  let source: AgeBandSource | null = null
  if (self && (!coach || RANK[self] < RANK[coach])) { band = self; source = 'self' }
  else if (coach) { band = coach; source = 'coach' }
  if (band !== 'under_13' && (input.ageGroups ?? []).some(ageGroupIsUnder13)) { band = 'under_13'; source = 'age_group' }
  else if (band === null && (input.ageGroups ?? []).some(ageGroupIsPlainYouth)) { band = 'under_13'; source = 'age_group' }
  return { band, source }
}

export { MONTHS } from './birth-months'

export type BirthAnswer = { ok: true; band: AgeBand } | { ok: false; error: string }

export const BIRTH_INVALID = 'Enter your birth month and year.'

/**
 * Birth month (1-12) and year to a band, on `now`'s date. Only the month is
 * known, so a birthday in the current month counts as not reached yet (the
 * younger answer).
 */
export function bandFromBirth(month: unknown, year: unknown, now: Date = new Date()): BirthAnswer {
  const m = Number(typeof month === 'string' ? month.trim() : month)
  const y = Number(typeof year === 'string' ? year.trim() : year)
  const thisYear = now.getFullYear()
  if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y) || y < thisYear - 120 || y > thisYear) {
    return { ok: false, error: BIRTH_INVALID }
  }
  const thisMonth = now.getMonth() + 1
  if (y === thisYear && m > thisMonth) return { ok: false, error: BIRTH_INVALID }
  const age = thisYear - y - (thisMonth <= m ? 1 : 0)
  return { ok: true, band: age < 13 ? 'under_13' : age < 18 ? '13_17' : '18_plus' }
}

/** Cookie set after an under-13 answer: blocks another answer for 24 hours (./age-stop-cookie). */
export const AGE_STOP_COOKIE = 'rp_age_stop'
