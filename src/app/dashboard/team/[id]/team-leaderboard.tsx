'use client'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

interface LeaderboardEntry {
  playerId: string
  playerName: string
  maxVelocity: number | null
  avgVelocity: number | null
  maxSpinRate: number | null
  avgSpinRate: number | null
  pitchCount: number
}

interface Props {
  entries: LeaderboardEntry[]
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex-1 h-1.5 bg-[#EEF2F7] rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export default function TeamLeaderboard({ entries }: Props) {
  if (entries.length === 0) return null

  const velEntries = entries.filter(e => e.maxVelocity != null).sort((a, b) => (b.maxVelocity ?? 0) - (a.maxVelocity ?? 0))
  const spinEntries = entries.filter(e => e.maxSpinRate != null).sort((a, b) => (b.maxSpinRate ?? 0) - (a.maxSpinRate ?? 0))

  if (velEntries.length === 0 && spinEntries.length === 0) return null

  const maxVel = velEntries[0]?.maxVelocity ?? 0
  const maxSpin = spinEntries[0]?.maxSpinRate ?? 0

  return (
    <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
      <div className="h-1 bg-[#C8102E]" />
      <div className="px-5 py-4 border-b border-[#DDE4ED]">
        <p className="text-sm text-[#0F1F33]" style={oswald}>Team Leaderboard</p>
        <p className="text-xs text-[#3D5166] mt-0.5">Rankings based on all tracked pitch data</p>
      </div>

      <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#DDE4ED]">
        {/* Velocity */}
        {velEntries.length > 0 && (
          <div className="p-4">
            <p className="text-[10px] text-[#C8102E] tracking-widest mb-3" style={oswald}>Top Velocity (mph)</p>
            <div className="space-y-3">
              {velEntries.map((entry, i) => (
                <div key={entry.playerId} className="flex items-center gap-3">
                  <span className="text-xs text-[#3D5166] w-4 shrink-0 text-right font-mono">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-[#0F1F33] truncate">{entry.playerName}</span>
                      <span className="text-xs font-mono text-[#0F1F33] ml-2 shrink-0">{entry.maxVelocity}</span>
                    </div>
                    <Bar value={entry.maxVelocity ?? 0} max={maxVel} color={i === 0 ? '#C8102E' : '#DDE4ED'} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Spin Rate */}
        {spinEntries.length > 0 && (
          <div className="p-4">
            <p className="text-[10px] text-[#1C3A5C] tracking-widest mb-3" style={oswald}>Top Spin Rate (rpm)</p>
            <div className="space-y-3">
              {spinEntries.map((entry, i) => (
                <div key={entry.playerId} className="flex items-center gap-3">
                  <span className="text-xs text-[#3D5166] w-4 shrink-0 text-right font-mono">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-[#0F1F33] truncate">{entry.playerName}</span>
                      <span className="text-xs font-mono text-[#0F1F33] ml-2 shrink-0">{entry.maxSpinRate?.toLocaleString()}</span>
                    </div>
                    <Bar value={entry.maxSpinRate ?? 0} max={maxSpin} color={i === 0 ? '#1C3A5C' : '#DDE4ED'} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
