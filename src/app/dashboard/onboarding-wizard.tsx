'use client'

import { useState, useEffect } from 'react'
import CreateTeamButton from './create-team-button'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

const DISMISSED_KEY = 'rp_wizard_dismissed'

interface Props {
  hasTeams: boolean
  hasPlayers: boolean
  hasClips?: boolean
  firstTeamId?: string
}

export default function CoachOnboardingWizard({ hasTeams, hasPlayers, hasClips = false, firstTeamId }: Props) {
  const allDone = hasTeams && hasPlayers && hasClips
  const [dismissed, setDismissed] = useState(false)

  // On mount, check if already dismissed from a previous session
  useEffect(() => {
    if (allDone && typeof window !== 'undefined' && localStorage.getItem(DISMISSED_KEY) === '1') {
      setDismissed(true)
    }
  }, [allDone])

  function dismiss() {
    if (typeof window !== 'undefined') localStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
  }

  if (dismissed) return null

  // Completion card — all 3 steps done
  if (allDone) {
    return (
      <div className="relative rounded-2xl overflow-hidden border border-green-200 bg-green-50 shadow-sm">
        <div className="h-1 bg-gradient-to-r from-green-400 to-green-600" />
        <div className="px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] tracking-[0.3em] text-green-700 mb-0.5" style={oswald}>All Set</p>
              <p className="text-sm text-green-900" style={oswald}>Your account is ready to use</p>
            </div>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-green-600 hover:text-green-800 transition-colors shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  const steps = [
    {
      n: '01',
      title: 'Create Your First Team',
      desc: 'Organize players by team and age group. Varsity, JV, travel, showcase.',
      done: hasTeams,
    },
    {
      n: '02',
      title: 'Invite Your First Player',
      desc: 'Add a player by email. They get a link to join and connect their profile to your roster.',
      done: hasPlayers,
    },
    {
      n: '03',
      title: 'Upload a Clip',
      desc: 'Film a bullpen or game appearance. Annotate mechanics, leave voice notes, ask the AI coach.',
      done: hasClips,
    },
  ]

  const activeStep = !hasTeams ? 0 : !hasPlayers ? 1 : 2

  return (
    <div className="relative rounded-2xl overflow-hidden border border-[#1C3A5C]/40 bg-white shadow-sm">
      <div className="h-1 bg-gradient-to-r from-[#C8102E] to-[#1C3A5C]" />

      <div className="px-6 py-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-[10px] tracking-[0.3em] text-[#C8102E] mb-0.5" style={oswald}>Getting Started</p>
            <h2 className="text-base text-[#0F1F33]" style={oswald}>Set Up Your Coaching Account</h2>
          </div>
          <span className="text-xs text-[#5B6B7F] bg-[#EEF2F7] px-2.5 py-1 rounded-full" style={oswald}>
            {activeStep} / 3 done
          </span>
        </div>

        <div className="space-y-3">
          {steps.map((step, i) => {
            const isActive = i === activeStep
            const isDone   = step.done
            return (
              <div
                key={step.n}
                className={`flex items-start gap-4 rounded-xl px-4 py-3.5 border transition-all ${
                  isDone
                    ? 'border-green-200 bg-green-50'
                    : isActive
                    ? 'border-[#C8102E]/30 bg-[#FFF5F7]'
                    : 'border-[#DDE4ED] bg-[#F5F7FA] opacity-60'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  isDone ? 'bg-green-500' : isActive ? 'bg-[#C8102E]' : 'bg-[#DDE4ED]'
                }`}>
                  {isDone ? (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-[11px] text-white font-bold" style={oswald}>{step.n}</span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm mb-0.5 ${isDone ? 'text-green-700 line-through opacity-70' : 'text-[#0F1F33]'}`} style={oswald}>
                    {step.title}
                  </p>
                  {!isDone && (
                    <p className="text-xs text-[#5B6B7F] leading-relaxed">{step.desc}</p>
                  )}
                </div>

                {isActive && (
                  <div className="shrink-0 self-center ml-2">
                    {i === 0 && <CreateTeamButton />}
                    {i === 1 && firstTeamId && (
                      <a
                        href={`/dashboard/team/${firstTeamId}`}
                        className="text-xs bg-[#C8102E] hover:bg-[#9E0E24] text-white px-3 py-1.5 rounded-md transition-colors whitespace-nowrap inline-block"
                        style={oswald}
                      >
                        Go to Team →
                      </a>
                    )}
                    {i === 1 && !firstTeamId && <CreateTeamButton />}
                    {i === 2 && firstTeamId && (
                      <a
                        href={`/dashboard/team/${firstTeamId}`}
                        className="text-xs bg-[#1C3A5C] hover:bg-[#15304F] text-white px-3 py-1.5 rounded-md transition-colors whitespace-nowrap inline-block"
                        style={oswald}
                      >
                        Go to Team →
                      </a>
                    )}
                    {i === 2 && !firstTeamId && <CreateTeamButton />}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
