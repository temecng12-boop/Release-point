'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import TimestampNotes from './timestamp-notes'
import TextNotes from './text-notes'
import MetricsTab from './metrics-tab'
import HittingMetricsTab from './hitting-metrics-tab'
import AiChat from './ai-chat'
import PhaseChecklist from './phase-checklist'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

type TSNote   = { id: string; time_seconds: number; body: string; drawing_data?: unknown[] | null }
export type Metric = { id: string; pitch_type: string | null; velocity: number | null; spin_rate: number | null; spin_axis: number | null; horizontal_break: number | null; vertical_break: number | null; extension?: number | null; vaa?: number | null }
type PhaseRow = { name: string; rating: 'good' | 'needs_work' | 'critical' | null; note: string }
type HittingMetrics = { ev_avg: number | null; ev_max: number | null; launch_angle_avg: number | null; barrel_rate: number | null; hard_hit_rate: number | null; sweet_spot_rate: number | null; attack_angle: number | null; bat_speed: number | null; ev_90th?: number | null; distance_avg?: number | null; distance_max?: number | null; pull_rate?: number | null; oppo_rate?: number | null; gb_rate?: number | null; ld_rate?: number | null; fb_rate?: number | null; contact_rate?: number | null; whiff_rate?: number | null }
type Tab      = 'Timestamps' | 'Notes' | 'Mechanics' | 'Metrics' | 'AI Coach'

function isPitcherPosition(pos: string | null): boolean {
  if (!pos) return true
  const p = pos.toLowerCase()
  return p === 'pitcher' || p === 'p' || p === 'rhp' || p === 'lhp' || p === 'sp' || p === 'rp' || p === 'cp'
}

function getTabs(isPitcher: boolean): Tab[] {
  return ['Timestamps', 'Notes', 'Mechanics', 'Metrics', 'AI Coach']
}

const TAB_LABEL: Record<Tab, (isPitcher: boolean) => string> = {
  Timestamps: () => 'Timestamps',
  Notes:      () => 'Notes',
  Mechanics:  (p) => p ? 'Mechanics' : 'Swing',
  Metrics:    (p) => p ? 'Metrics' : 'Hit Data',
  'AI Coach': () => 'AI Coach',
}

const TAB_SHORT: Record<Tab, (isPitcher: boolean) => string> = {
  Timestamps: () => 'Times',
  Notes:      () => 'Notes',
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
  initialTsNotes,
  initialMetrics,
  initialChecklist,
  initialHittingMetrics,
  playerName,
  playerAgeGroup,
  playerPosition,
}: {
  clipId: string
  playerId: string
  role: 'coach' | 'player'
  initialNotes: string | null
  initialTsNotes: TSNote[]
  initialMetrics: Metric[]
  initialChecklist: PhaseRow[] | null
  initialHittingMetrics: HittingMetrics | null
  playerName: string
  playerAgeGroup: string | null
  playerPosition: string | null
}) {
  const [active,   setActive]   = useState<Tab>('Timestamps')
  const [metrics,  setMetrics]  = useState<Metric[]>(initialMetrics)
  const [clipMode, setClipMode] = useState<'pitcher' | 'hitter'>(() => isPitcherPosition(playerPosition) ? 'pitcher' : 'hitter')
  const isPitcher = clipMode === 'pitcher'
  const TABS = getTabs(isPitcher)

  return (
    <div>
      {/* Pitcher / Hitter mode toggle */}
      <div className="flex items-center justify-between mb-3">
        <div
          className="inline-flex items-center rounded-full p-0.5"
          style={{ background: '#F0F4F8', border: '1px solid #DDE4ED' }}
        >
          <button
            onClick={() => setClipMode('pitcher')}
            className="px-5 py-1.5 rounded-full text-[11px] tracking-widest transition-all"
            style={{
              ...os,
              background: clipMode === 'pitcher' ? '#C8102E' : 'transparent',
              color: clipMode === 'pitcher' ? 'white' : '#94a3b8',
            }}
          >
            Pitcher
          </button>
          <button
            onClick={() => setClipMode('hitter')}
            className="px-5 py-1.5 rounded-full text-[11px] tracking-widest transition-all"
            style={{
              ...os,
              background: clipMode === 'hitter' ? '#1C3A5C' : 'transparent',
              color: clipMode === 'hitter' ? 'white' : '#94a3b8',
            }}
          >
            Hitter
          </button>
        </div>
        <span className="text-[10px] text-[#94a3b8]" style={os}>
          {isPitcher ? 'Randy Johnson × Nolan Ryan' : 'Barry Bonds × Tony Gwynn'}
        </span>
      </div>

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
              <span className="hidden sm:inline">{TAB_LABEL[tab](isPitcher)}</span>
              <span className="sm:hidden">{TAB_SHORT[tab](isPitcher)}</span>

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
              <TimestampNotes clipId={clipId} playerId={playerId} role={role} initialNotes={initialTsNotes} />
            )}
            {active === 'Notes' && (
              <TextNotes clipId={clipId} role={role} initialNotes={initialNotes} />
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
                />
              ) : (
                <HittingMetricsTab
                  clipId={clipId}
                  role={role}
                  initial={initialHittingMetrics}
                />
              )
            )}
            {active === 'AI Coach' && (
              <AiChat
                key={clipMode}
                clipId={clipId}
                role={role}
                playerName={playerName}
                playerAgeGroup={playerAgeGroup}
                playerPosition={playerPosition}
                metrics={metrics}
                checklist={initialChecklist}
                coachNotes={initialNotes}
                forcedAgent={isPitcher ? 'randy' : 'barry'}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
