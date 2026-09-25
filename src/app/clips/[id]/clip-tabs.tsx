'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import TimestampNotes from './timestamp-notes'
import TextNotes from './text-notes'
import VoiceNote from './voice-note'
import MetricsTab from './metrics-tab'
import AiChat from './ai-chat'
import PhaseChecklist from './phase-checklist'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

type TSNote   = { id: string; time_seconds: number; body: string; drawing_data?: unknown[] | null }
export type Metric = { id: string; pitch_type: string | null; velocity: number | null; spin_rate: number | null; spin_axis: number | null; horizontal_break: number | null; vertical_break: number | null; extension?: number | null; vaa?: number | null }
type PhaseRow = { name: string; rating: 'good' | 'needs_work' | 'critical' | null; note: string }
type Tab      = 'Timestamps' | 'Notes' | 'Voice' | 'Mechanics' | 'Metrics' | 'AI Coach'

const TABS: Tab[] = ['Timestamps', 'Notes', 'Voice', 'Mechanics', 'Metrics', 'AI Coach']
const TAB_SHORT: Record<Tab, string> = {
  Timestamps: 'Times',
  Notes:      'Notes',
  Voice:      'Voice',
  Mechanics:  'Mech',
  Metrics:    'Stats',
  'AI Coach': 'AI',
}

const tabVariants = {
  enter: { opacity: 0, y: 6 },
  center: { opacity: 1, y: 0 },
  exit:  { opacity: 0, y: -4 },
}

export default function ClipTabs({
  clipId,
  playerId,
  role,
  initialNotes,
  initialVoiceUrl,
  initialTsNotes,
  initialMetrics,
  initialChecklist,
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
  initialChecklist: PhaseRow[] | null
  playerName: string
  playerAgeGroup: string | null
  playerPosition: string | null
}) {
  const [active, setActive] = useState<Tab>('Timestamps')

  return (
    <div>
      {/* Tab bar */}
      <div className="relative z-10 flex" style={{ borderBottom: '1px solid #e2e8f0' }}>
        {TABS.map((tab) => {
          const isActive = active === tab
          return (
            <button
              key={tab}
              onClick={() => setActive(tab)}
              className="relative flex-1 px-1 sm:px-4 py-2.5 text-[10px] sm:text-[12px] tracking-wider transition-colors text-center"
              style={{ ...os, color: isActive ? '#0f172a' : '#94a3b8' }}
            >
              <span className="hidden sm:inline">{tab}</span>
              <span className="sm:hidden">{TAB_SHORT[tab]}</span>

              {isActive && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 inset-x-0 h-px"
                  style={{ background: '#E8102A' }}
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Tab content with AnimatePresence */}
      <div className="mt-4 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active}
            variants={tabVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            {active === 'Timestamps' && (
              <TimestampNotes clipId={clipId} role={role} initialNotes={initialTsNotes} />
            )}
            {active === 'Notes' && (
              <TextNotes clipId={clipId} role={role} initialNotes={initialNotes} />
            )}
            {active === 'Voice' && (
              <VoiceNote clipId={clipId} playerId={playerId} role={role} initialVoiceUrl={initialVoiceUrl} />
            )}
            {active === 'Mechanics' && (
              <PhaseChecklist clipId={clipId} role={role} initial={initialChecklist} />
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
                checklist={initialChecklist}
                coachNotes={initialNotes}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
