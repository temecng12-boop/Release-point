'use client'

import { useState, useEffect, useActionState } from 'react'
import { createTeam } from '@/app/actions/team'
import Logo from '@/components/Logo'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }
const inputClass = 'w-full bg-white border border-[#DDE4ED] text-[#0F1F33] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#456080] placeholder:text-[#94a3b8]'
const AGE_GROUPS = ['Youth', 'Middle School', 'High School', 'Amateur', 'Professional']

function Step1Welcome({ coachName, onNext }: { coachName: string; onNext: () => void }) {
  return (
    <div className="text-center space-y-6">
      <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-2xl text-white"
        style={{ ...os, background: 'linear-gradient(135deg, #E8102A, #A50D1E)' }}>
        {coachName.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2)}
      </div>
      <div>
        <p className="text-[10px] tracking-[0.3em] text-[#C8102E] mb-1" style={os}>Welcome to Release Point AI</p>
        <h1 className="text-2xl text-[#0F1F33] tracking-tight" style={os}>Hey, {coachName.split(' ')[0]}!</h1>
        <p className="text-sm text-[#5B6B7F] mt-3 leading-relaxed max-w-xs mx-auto">
          You're in. Let's get your coaching account set up in 2 quick steps.
        </p>
      </div>

      <div className="grid gap-3 text-left max-w-xs mx-auto">
        {[
          { n: '01', label: 'Create your first team' },
          { n: '02', label: 'Invite players to your roster' },
        ].map(item => (
          <div key={item.n} className="flex items-center gap-3 rounded-xl px-4 py-3 border border-[#DDE4ED] bg-[#F5F7FA]">
            <div className="w-7 h-7 rounded-full bg-[#C8102E] flex items-center justify-center shrink-0">
              <span className="text-[10px] text-white font-bold" style={os}>{item.n}</span>
            </div>
            <p className="text-sm text-[#0F1F33]" style={os}>{item.label}</p>
          </div>
        ))}
      </div>

      <button
        onClick={onNext}
        className="w-full max-w-xs mx-auto block bg-[#C8102E] hover:bg-[#9E0E24] text-white rounded-lg py-3 text-sm transition-colors"
        style={os}
      >
        Get Started →
      </button>
    </div>
  )
}

function Step2CreateTeam({ onCreated }: { onCreated: (teamId: string, teamName: string) => void }) {
  const [state, action, pending] = useActionState(createTeam, undefined)

  useEffect(() => {
    if (state?.success && state.teamId) {
      const name = (document.querySelector('input[name="name"]') as HTMLInputElement)?.value ?? 'Your Team'
      onCreated(state.teamId, name)
    }
  }, [state?.success, state?.teamId, onCreated])

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] tracking-[0.3em] text-[#C8102E] mb-1" style={os}>Step 1 of 2</p>
        <h2 className="text-xl text-[#0F1F33] tracking-tight" style={os}>Create Your First Team</h2>
        <p className="text-sm text-[#5B6B7F] mt-1">Name it after your program — Varsity, JV, travel team, etc.</p>
      </div>

      <form action={action} className="space-y-4">
        <div>
          <label className="block text-xs text-[#456080] mb-1.5 tracking-[0.15em]" style={os}>Team Name</label>
          <input
            type="text"
            name="name"
            placeholder="e.g. Varsity 2025, 16U Travel"
            required
            autoFocus
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs text-[#456080] mb-1.5 tracking-[0.15em]" style={os}>Age Group</label>
          <select name="age_group" className={inputClass} style={{ color: '#0F1F33' }}>
            <option value="">— select one —</option>
            {AGE_GROUPS.map(ag => (
              <option key={ag} value={ag}>{ag}</option>
            ))}
          </select>
        </div>

        {state?.error && (
          <p className="text-xs text-[#C8102E]">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full bg-[#C8102E] hover:bg-[#9E0E24] text-white rounded-lg py-3 text-sm transition-colors disabled:opacity-50"
          style={os}
        >
          {pending ? 'Creating…' : 'Create Team →'}
        </button>
      </form>
    </div>
  )
}

function Step3Done({ teamId, teamName }: { teamId: string; teamName: string }) {
  return (
    <div className="text-center space-y-6">
      <div className="w-16 h-16 rounded-full mx-auto bg-green-100 flex items-center justify-center">
        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div>
        <p className="text-[10px] tracking-[0.3em] text-green-600 mb-1" style={os}>Team Created</p>
        <h2 className="text-xl text-[#0F1F33] tracking-tight" style={os}>{teamName} is Ready</h2>
        <p className="text-sm text-[#5B6B7F] mt-2 leading-relaxed max-w-xs mx-auto">
          Next, invite your players from the team page. They'll get an email to join and connect their profile to your roster.
        </p>
      </div>

      <div className="space-y-3 max-w-xs mx-auto">
        <a
          href={`/dashboard/team/${teamId}`}
          className="block w-full bg-[#C8102E] hover:bg-[#9E0E24] text-white rounded-lg py-3 text-sm transition-colors text-center"
          style={os}
        >
          Go to Team Page →
        </a>
        <a
          href="/dashboard"
          className="block w-full text-center text-sm text-[#5B6B7F] hover:text-[#0F1F33] py-2 transition-colors"
          style={os}
        >
          Go to Dashboard
        </a>
      </div>
    </div>
  )
}

export default function CoachOnboardingFlow({ coachName }: { coachName: string }) {
  const [step, setStep] = useState<'welcome' | 'create-team' | 'done'>('welcome')
  const [createdTeamId, setCreatedTeamId] = useState('')
  const [createdTeamName, setCreatedTeamName] = useState('')

  function handleTeamCreated(teamId: string, teamName: string) {
    setCreatedTeamId(teamId)
    setCreatedTeamName(teamName)
    setStep('done')
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-[#DDE4ED]">
        <Logo size="sm" href="/" wordmarkClass="hidden min-[480px]:inline" />
        <a href="/dashboard" className="text-xs text-[#5B6B7F] hover:text-[#0F1F33] transition-colors" style={os}>
          Skip →
        </a>
      </div>

      {/* Progress dots */}
      {step !== 'done' && (
        <div className="flex items-center justify-center gap-2 pt-6">
          {(['welcome', 'create-team'] as const).map(s => (
            <div
              key={s}
              className="w-2 h-2 rounded-full transition-colors"
              style={{ background: s === step ? '#C8102E' : '#DDE4ED' }}
            />
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-md bg-white rounded-2xl border border-[#DDE4ED] shadow-sm overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-[#C8102E] to-[#1C3A5C]" />
          <div className="p-8">
            {step === 'welcome'     && <Step1Welcome coachName={coachName} onNext={() => setStep('create-team')} />}
            {step === 'create-team' && <Step2CreateTeam onCreated={handleTeamCreated} />}
            {step === 'done'        && <Step3Done teamId={createdTeamId} teamName={createdTeamName} />}
          </div>
        </div>
      </div>
    </div>
  )
}
