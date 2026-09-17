'use client'

import { useState } from 'react'
import TimestampNotes from './timestamp-notes'
import TextNotes from './text-notes'
import VoiceNote from './voice-note'
import MetricsTab from './metrics-tab'
import AiChat from './ai-chat'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

type TSNote   = { id: string; time_seconds: number; text: string }
type Metric   = { id: string; pitch_type: string | null; velocity: number | null; spin_rate: number | null; spin_axis: number | null; horizontal_break: number | null; vertical_break: number | null }
type Tab      = 'Timestamps' | 'Notes' | 'Voice' | 'Metrics' | 'AI Coach'

const TABS: Tab[] = ['Timestamps', 'Notes', 'Voice', 'Metrics', 'AI Coach']

export default function ClipTabs({
  clipId,
  playerId,
  role,
  initialNotes,
  initialVoiceUrl,
  initialTsNotes,
  initialMetrics,
  playerName,
  playerAgeGroup,
  playerPosition,
}: {
  clipId: string
  playerId: string
  role: 'coach' | 'player'
  initialNotes: string | null
  initialVoiceUrl: string | null
  initialTsNotes: TSNote[]
  initialMetrics: Metric[]
  playerName: string
  playerAgeGroup: string | null
  playerPosition: string | null
}) {
  const [active, setActive] = useState<Tab>('Timestamps')

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-[#1C3A5C] overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`px-4 py-2.5 text-xs tracking-widest transition-colors border-b-2 -mb-px whitespace-nowrap ${
              active === tab
                ? 'border-[#C8102E] text-[#E8EDF5]'
                : 'border-transparent text-[#4A6880] hover:text-[#9FB3CC]'
            }`}
            style={oswald}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="mt-4">
        {active === 'Timestamps' && (
          <TimestampNotes clipId={clipId} role={role} initialNotes={initialTsNotes} />
        )}
        {active === 'Notes' && (
          <TextNotes clipId={clipId} role={role} initialNotes={initialNotes} />
        )}
        {active === 'Voice' && (
          <VoiceNote clipId={clipId} playerId={playerId} role={role} initialVoiceUrl={initialVoiceUrl} />
        )}
        {active === 'Metrics' && (
          <MetricsTab
            clipId={clipId}
            role={role}
            playerId={playerId}
            playerAgeGroup={playerAgeGroup}
            playerPosition={playerPosition}
            initialMetrics={initialMetrics}
          />
        )}
        {active === 'AI Coach' && (
          <AiChat
            clipId={clipId}
            role={role}
            playerName={playerName}
            playerAgeGroup={playerAgeGroup}
            playerPosition={playerPosition}
            metrics={initialMetrics}
          />
        )}
      </div>
    </div>
  )
}
