'use client'

import { useState } from 'react'
import { joinWaitlist } from '@/app/actions/waitlist'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

const inputClass = 'w-full bg-white border border-[#DDE4ED] rounded-lg px-4 py-3 text-sm text-[#0F1F33] placeholder:text-[#8096AE] focus:outline-none focus:border-[#456080] transition-colors'
const labelClass = 'block text-[10px] tracking-[0.15em] text-[#456080] mb-1.5'
const selectClass = `${inputClass} appearance-none cursor-pointer`

export default function WaitlistForm() {
  const [name,           setName]           = useState('')
  const [email,          setEmail]          = useState('')
  const [role,           setRole]           = useState('')
  const [programName,    setProgramName]    = useState('')
  const [athleteCount,   setAthleteCount]   = useState('')
  const [tech,           setTech]           = useState('')
  const [referral,       setReferral]       = useState('')
  const [state,          setState]          = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message,        setMessage]        = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setState('loading')
    const result = await joinWaitlist({ email, name, role, programName, athleteCount, tech, referral })
    if (result.success) {
      setState('success')
    } else {
      setState('error')
      setMessage(result.error ?? 'Something went wrong.')
    }
  }

  if (state === 'success') {
    return (
      <div className="text-center py-4 space-y-3">
        <div className="w-12 h-12 rounded-full bg-[#C8102E]/10 border border-[#C8102E]/30 flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-[#C8102E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-[#0F1F33] text-sm font-medium" style={os}>You&apos;re on the list</p>
        <p className="text-[#456080] text-xs">We&apos;ll reach out to {email} when your spot is ready. Thanks for the support.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div>
        <label htmlFor="wl-name" className={labelClass} style={os}>Name</label>
        <input
          id="wl-name"
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Your name"
          className={inputClass}
        />
      </div>

      {/* Email */}
      <div>
        <label htmlFor="wl-email" className={labelClass} style={os}>Email <span className="text-[#C8102E]">*</span></label>
        <input
          id="wl-email"
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); if (state === 'error') setState('idle') }}
          placeholder="you@example.com"
          required
          className={inputClass}
        />
      </div>

      {/* Role */}
      <div>
        <label htmlFor="wl-role" className={labelClass} style={os}>I am a</label>
        <div className="relative">
          <select
            id="wl-role"
            value={role}
            onChange={e => setRole(e.target.value)}
            className={selectClass}
          >
            <option value="">Select your role…</option>
            <option value="coach">Pitching / Hitting Coach</option>
            <option value="org_admin">Program Director / Org Admin</option>
            <option value="player">Player</option>
            <option value="parent">Parent</option>
          </select>
          <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8096AE]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Program name */}
      <div>
        <label htmlFor="wl-program" className={labelClass} style={os}>Program or Academy Name</label>
        <input
          id="wl-program"
          type="text"
          value={programName}
          onChange={e => setProgramName(e.target.value)}
          placeholder="e.g. Top Tier Baseball, Oak Hill HS"
          className={inputClass}
        />
      </div>

      {/* Athlete count */}
      <div>
        <label htmlFor="wl-athletes" className={labelClass} style={os}>Athletes You Work With</label>
        <div className="relative">
          <select
            id="wl-athletes"
            value={athleteCount}
            onChange={e => setAthleteCount(e.target.value)}
            className={selectClass}
          >
            <option value="">Select a range…</option>
            <option value="1-5">1–5</option>
            <option value="6-15">6–15</option>
            <option value="16-40">16–40</option>
            <option value="40+">40+</option>
          </select>
          <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8096AE]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Tech stack */}
      <div>
        <label htmlFor="wl-tech" className={labelClass} style={os}>Tracking Technology</label>
        <div className="relative">
          <select
            id="wl-tech"
            value={tech}
            onChange={e => setTech(e.target.value)}
            className={selectClass}
          >
            <option value="">What do you use?</option>
            <option value="rapsodo">Rapsodo</option>
            <option value="trackman">TrackMan</option>
            <option value="hawkeye">Hawk-Eye</option>
            <option value="both">Rapsodo + TrackMan</option>
            <option value="none">None yet</option>
          </select>
          <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8096AE]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Referral */}
      <div>
        <label htmlFor="wl-referral" className={labelClass} style={os}>How Did You Hear About Us?</label>
        <div className="relative">
          <select
            id="wl-referral"
            value={referral}
            onChange={e => setReferral(e.target.value)}
            className={selectClass}
          >
            <option value="">Select one…</option>
            <option value="coach">Another Coach</option>
            <option value="social">Social Media</option>
            <option value="search">Search (Google, etc.)</option>
            <option value="linkedin">LinkedIn</option>
            <option value="event">Event / Clinic</option>
            <option value="other">Other</option>
          </select>
          <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8096AE]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {state === 'error' && (
        <p className="text-[#C8102E] text-xs">{message}</p>
      )}

      <button
        type="submit"
        disabled={state === 'loading' || !email}
        className="w-full bg-[#C8102E] hover:bg-[#9E0E24] disabled:opacity-50 text-white py-3 rounded-lg text-sm transition-colors mt-2"
        style={os}
      >
        {state === 'loading' ? 'Joining…' : 'Join the Waitlist'}
      </button>
    </form>
  )
}
