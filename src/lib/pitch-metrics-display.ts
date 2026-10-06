// Pitching metrics for the clip Metrics tab: the six tiles the promo shows
// (Velo, Spin, IVB, H-Break, Ext, Axis). Pure helpers — no React, no Supabase.
// Axis is stored as degrees (12:00 = 0°) and shown as a clock face; the small
// "tilt" subtitle matches the app's existing Axis (tilt) wording.

import { degreesToClock } from '@/lib/spin-axis'

export type PitchMetricValues = {
  velocity: number | null
  spin_rate: number | null
  spin_axis: number | null
  vertical_break: number | null
  horizontal_break: number | null
  extension?: number | null
}

export type PitchMetricTile = {
  key: 'velocity' | 'spin_rate' | 'vertical_break' | 'horizontal_break' | 'extension' | 'spin_axis'
  /** Short label on the tile (promo names). */
  label: string
  /** Optional secondary label under the name (Axis only). */
  subtitle: string | null
  unit: string
  /** Accent bar / number color — promo brand primary for velo; other tiles keep distinct accents. */
  accent: string
  /** Display string for the big number, or null when empty (UI shows an em dash). */
  value: string | null
}

const ACCENT = {
  velocity: '#C8031E',
  spin_rate: '#3B82F6',
  vertical_break: '#10B981',
  horizontal_break: '#8B5CF6',
  extension: '#06B6D4',
  spin_axis: '#F59E0B',
} as const

function fmt(n: number, decimals: number): string {
  return decimals > 0 ? n.toFixed(decimals) : Math.round(n).toLocaleString('en-US')
}

/** Build the six tiles for one pitch row. Missing fields → value null (honest empty). Never invents demo numbers. */
export function pitchMetricTiles(row: PitchMetricValues | null | undefined): PitchMetricTile[] {
  const r = row ?? null
  return [
    {
      key: 'velocity',
      label: 'Velo',
      subtitle: null,
      unit: 'mph',
      accent: ACCENT.velocity,
      value: r?.velocity != null && Number.isFinite(r.velocity) ? fmt(r.velocity, 1) : null,
    },
    {
      key: 'spin_rate',
      label: 'Spin',
      subtitle: null,
      unit: 'rpm',
      accent: ACCENT.spin_rate,
      value: r?.spin_rate != null && Number.isFinite(r.spin_rate) ? fmt(r.spin_rate, 0) : null,
    },
    {
      key: 'vertical_break',
      label: 'IVB',
      subtitle: null,
      unit: 'in',
      accent: ACCENT.vertical_break,
      value: r?.vertical_break != null && Number.isFinite(r.vertical_break)
        ? `${r.vertical_break > 0 ? '+' : ''}${fmt(r.vertical_break, 1)}`
        : null,
    },
    {
      key: 'horizontal_break',
      label: 'H-Break',
      subtitle: null,
      unit: 'in',
      accent: ACCENT.horizontal_break,
      value: r?.horizontal_break != null && Number.isFinite(r.horizontal_break)
        ? `${r.horizontal_break > 0 ? '+' : ''}${fmt(r.horizontal_break, 1)}`
        : null,
    },
    {
      key: 'extension',
      label: 'Ext',
      subtitle: null,
      unit: 'ft',
      accent: ACCENT.extension,
      value: r?.extension != null && Number.isFinite(r.extension) ? fmt(r.extension, 1) : null,
    },
    {
      key: 'spin_axis',
      label: 'Axis',
      subtitle: 'tilt',
      unit: '',
      accent: ACCENT.spin_axis,
      value: r?.spin_axis != null && Number.isFinite(r.spin_axis) ? degreesToClock(r.spin_axis) : null,
    },
  ]
}

/** True when every tile is empty (no pitch data yet). */
export function pitchMetricsEmpty(tiles: PitchMetricTile[]): boolean {
  return tiles.every(t => t.value == null)
}
