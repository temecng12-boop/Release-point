'use client'

import { pitchMetricTiles, pitchMetricsEmpty, type PitchMetricValues } from '@/lib/pitch-metrics-display'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

/**
 * Six pitching metrics tiles (Velo, Spin, IVB, H-Break, Ext, Axis).
 * Empty fields show an em dash — never demo numbers. Accent bar uses the
 * existing clip-page palette (brand tokens are not live in the app yet).
 */
export default function PitchMetricsTiles({
  row,
  emptyHint = 'No data yet',
}: {
  row: PitchMetricValues | null | undefined
  /** Shown under the grid when every tile is empty. */
  emptyHint?: string
}) {
  const tiles = pitchMetricTiles(row)
  const allEmpty = pitchMetricsEmpty(tiles)

  return (
    <div>
      <div
        className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3"
        role="list"
        aria-label="Pitch metrics"
      >
        {tiles.map(t => (
          <div
            key={t.key}
            role="listitem"
            className="relative bg-white border border-[#DDE4ED] rounded-md px-3 py-3 sm:px-4 sm:py-3.5 overflow-hidden min-h-[88px] flex flex-col justify-between"
            data-tile={t.key}
            data-empty={t.value == null ? 'true' : 'false'}
          >
            <span
              aria-hidden="true"
              className="absolute left-0 top-0 bottom-0 w-1 rounded-l-md"
              style={{ background: t.accent }}
            />
            <div className="pl-1.5">
              <p className="text-[10px] tracking-widest text-[#3D5166]" style={oswald}>
                {t.label}
                {t.subtitle ? (
                  <span className="ml-1.5 normal-case tracking-normal text-[#8096AE] font-normal" style={{ fontFamily: 'inherit', textTransform: 'none' }}>
                    {t.subtitle}
                  </span>
                ) : null}
              </p>
              <p className="mt-1.5 flex items-baseline gap-1.5 min-h-[1.75rem]">
                {t.value != null ? (
                  <>
                    <span className="text-2xl sm:text-[1.75rem] font-mono leading-none text-[#0F1F33]" style={{ color: t.accent }}>
                      {t.value}
                    </span>
                    {t.unit ? (
                      <span className="text-[11px] text-[#8096AE]">{t.unit}</span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-2xl sm:text-[1.75rem] font-mono leading-none text-[#DDE4ED]" aria-label="No data">
                    —
                  </span>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
      {allEmpty ? (
        <p className="mt-2 text-xs text-[#8096AE] text-center sm:text-left">{emptyHint}</p>
      ) : null}
    </div>
  )
}
