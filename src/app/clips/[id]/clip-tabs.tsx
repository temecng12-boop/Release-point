'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import TimestampNotes from './timestamp-notes'
import TextNotes from './text-notes'
import VoiceNote from './voice-note'
import MetricsTab from './metrics-tab'
import HittingMetricsTab from './hitting-metrics-tab'
import AiChat from './ai-chat'
import PhaseChecklist from './phase-checklist'
import ClipKindToggle from './clip-kind-toggle'
import type { ClipKind } from '@/lib/positions'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

type TSNote   = { id: string; time_seconds: number; body: string; drawing_data?: unknown[] | null }
export type Metric = { id: string; pitch_type: string | null; velocity: number | null; spin_rate: number | null; spin_axis: number | null; horizontal_break: number | null; vertical_break: number | null; extension?: number | null; vaa?: number | null }
type PhaseRow = { name: string; rating: 'good' | 'needs_work' | 'critical' | null; note: string }
type HittingMetrics = { ev_avg: number | null; ev_max: number | null; launch_angle_avg: number | null; barrel_rate: number | null; hard_hit_rate: number | null; sweet_spot_rate: number | null; attack_angle: number | null; bat_speed: number | null }
type Tab      = 'Timestamps' | 'Notes' | 'Voice' | 'Mechanics' | 'Metrics' | 'AI Coach'

function getTabs(): Tab[] {
  return ['Timestamps', 'Notes', 'Voice', 'Mechanics', 'Metrics', 'AI Coach']
}

const TAB_LABEL: Record<Tab, (isPitcher: boolean) => string> = {
  Timestamps: () => 'Timestamps',
  Notes:      () => 'Notes',
  Voice:      () => 'Voice',
  Mechanics:  (p) => p ? 'Mechanics' : 'Swing',
  Metrics:    (p) => p ? 'Metrics' : 'Hit Data',
  'AI Coach': () => 'AI Coach',
}

const TAB_SHORT: Record<Tab, (isPitcher: boolean) => string> = {
  Timestamps: () => 'Times',
  Notes:      () => 'Notes',
  Voice:      () => 'Voice',
  Mechanics:  (p) => p ? 'Mech' : 'Swing',
  Metrics:    (p) => p ? 'Stats' : 'Data',
  'AI Coach': () => 'AI',
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
  canDeleteMetrics = false,
  canAddMetrics = false,
  initialChecklist,
  initialHittingMetrics,
  playerName,
  playerAgeGroup,
  playerPosition,
  initialClipKind,
  canEditClipKind = true,
  aiCoachAvailable = true,
  canAddMedia,
}: {
  clipId: string
  playerId: string
  role: 'coach' | 'player'
  initialNotes: string | null
  initialVoiceUrl: string | null
  initialTsNotes: TSNote[]
  initialMetrics: Metric[]
  /** Show delete buttons for saved metrics: only for the player's direct coach. */
  canDeleteMetrics?: boolean
  /** Show pitch entry and CSV/PDF import: the direct coach or the player (not team coaches). */
  canAddMetrics?: boolean
  initialChecklist: PhaseRow[] | null
  initialHittingMetrics: HittingMetrics | null
  playerName: string
  playerAgeGroup: string | null
  playerPosition: string | null
  /** Resolved pitching/hitting for this clip (saved toggle, else default from positions). */
  initialClipKind: ClipKind
  /** Coach or player may save the toggle; guardians see it but cannot change it. */
  canEditClipKind?: boolean
  /** Whether this viewer may use the AI Coach (own coach or the player). */
  aiCoachAvailable?: boolean
  /** False when the player has no 18+ confirmation or guardian consent (src/lib/consent.ts). */
  canAddMedia: boolean
}) {
  const [active, setActive] = useState<Tab>('Timestamps')
  const [metrics, setMetrics] = useState<Metric[]>(initialMetrics)
  const [clipKind, setClipKind] = useState<ClipKind>(initialClipKind)
  const isPitcher = clipKind === 'pitching'
  const TABS = getTabs()

  return (
    <div>
      <ClipKindToggle
        clipId={clipId}
        value={clipKind}
        canEdit={canEditClipKind}
        onSaved={setClipKind}
      />
      {/* Tab bar */}
      <div className="relative z-10 flex" style={{ borderBottom: '1px solid #e2e8f0' }}>
        {TABS.map((tab) => {
          const isActive = active === tab
          return (
            <button
              key={tab}
              onClick={() => setActive(tab)}
              className={`relative flex-1 px-1 sm:px-4 py-2.5 text-[10px] sm:text-[12px] tracking-wider transition-colors text-center max-sm:min-h-11 ${isActive ? 'rp-tab-active' : ''}`}
              style={{ ...os, color: isActive ? 'var(--rp-navy, #023167)' : '#94a3b8' }}
            >
              <span className="hidden sm:inline">{TAB_LABEL[tab](isPitcher)}</span>
              <span className="sm:hidden">{TAB_SHORT[tab](isPitcher)}</span>

              {isActive && (
                <motion.div
                  layoutId="tab-indicator"
                  className="rp-tab-indicator absolute bottom-0 inset-x-0 h-0.5"
                  style={{ background: 'var(--rp-navy, #023167)' }}
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
              <TimestampNotes clipId={clipId} playerId={playerId} role={role} initialNotes={initialTsNotes} />
            )}
            {active === 'Notes' && (
              <TextNotes clipId={clipId} role={role} initialNotes={initialNotes} />
            )}
            {active === 'Voice' && (
              <VoiceNote clipId={clipId} playerId={playerId} role={role} initialVoiceUrl={initialVoiceUrl} canAddMedia={canAddMedia} />
            )}
            {active === 'Mechanics' && (
              <PhaseChecklist clipId={clipId} role={role} initial={initialChecklist} isPitcher={isPitcher} />
            )}
            {active === 'Metrics' && (
              isPitcher ? (
                <MetricsTab
                  clipId={clipId}
                  role={role}
                  playerId={playerId}
                  playerAgeGroup={playerAgeGroup}
                  playerPosition={playerPosition}
                  initialMetrics={metrics}
                  onMetricsChange={setMetrics}
                  canDelete={canDeleteMetrics}
                  canAdd={canAddMetrics}
                />
              ) : (
                <HittingMetricsTab
                  clipId={clipId}
                  role={role}
                  initial={initialHittingMetrics}
                  canDelete={canDeleteMetrics}
                  canEdit={canAddMetrics}
                />
              )
            )}
            {active === 'AI Coach' && (
              <AiChat
                clipId={clipId}
                available={aiCoachAvailable}
                role={role}
                playerName={playerName}
                playerAgeGroup={playerAgeGroup}
                playerPosition={playerPosition}
                metrics={metrics}
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
