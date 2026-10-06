'use client'

import { useEffect, useRef, useState, Fragment } from 'react'
import { aiCoachAudienceBadge, aiCoachAudienceEyebrow } from '@/lib/ai-coach-badge'

type Agent   = 'randy' | 'barry'
type Message = { role: 'user' | 'assistant'; content: string }

function renderMarkdown(text: string) {
  return text.split('\n').map((line, li) => (
    <Fragment key={li}>
      {li > 0 && <br />}
      {line.split(/(\*\*[^*]+\*\*)/).map((part, pi) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={pi}>{part.slice(2, -2)}</strong>
          : part
      )}
    </Fragment>
  ))
}

type Metric   = { id: string; pitch_type: string | null; velocity: number | null; spin_rate: number | null; spin_axis: number | null; horizontal_break: number | null; vertical_break: number | null }
type PhaseRow = { name: string; rating: 'good' | 'needs_work' | 'critical' | null; note: string }

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

const AGENTS = {
  randy: {
    name: 'Randy',
    role: 'Pitching',
    color: '#C8102E',
    bg: '#FFF5F5',
    border: '#FBD0D6',
    description: 'Mechanics, velocity, spin, and pitch design.',
    placeholder: 'Ask Randy anything about pitching…',
    intro: "I've got this clip's notes and numbers. I can't watch the video, so I work from the coach's notes and the metrics. What are we working on?",
  },
  barry: {
    name: 'Barry',
    role: 'Hitting',
    color: '#1C3A5C',
    bg: '#F0F4F8',
    border: '#C0CFE0',
    description: 'Swing mechanics, exit velocity, and bat path.',
    placeholder: 'Ask Barry anything about hitting…',
    intro: "I've got this clip's notes and numbers. I can't watch the video, so I work from the coach's notes and the metrics. What are we working on?",
  },
}

// The chat sends only the clip id; the server loads the player's details,
// pitch data, checklist and notes itself after an access check. The other
// props are kept for the existing callers but are no longer sent.
export default function AIChat({
  clipId,
  available = true,
  role,
}: {
  clipId: string
  /** False for viewers the server won't serve (guardians): show a notice instead of the chat. */
  available?: boolean
  role: 'coach' | 'player'
  playerName: string
  playerAgeGroup: string | null
  playerPosition: string | null
  metrics?: Metric[]
  checklist?: PhaseRow[] | null
  coachNotes?: string | null
}) {
  const [agent,     setAgent]     = useState<Agent | null>(null)
  const [messages,  setMessages]  = useState<Message[]>([])
  const [input,     setInput]     = useState('')
  const [streaming, setStreaming] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, streaming])

  function chooseAgent(a: Agent) {
    setAgent(a)
    setMessages([])
    setInput('')
    setStreaming('')
  }

  async function sendMessage() {
    const text = input.trim()
    if (!text || isLoading || !agent) return

    const userMsg: Message = { role: 'user', content: text }
    const nextMessages: Message[] = [...messages, userMsg]

    setMessages(nextMessages)
    setInput('')
    setIsLoading(true)
    setStreaming('')

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages,
          agent,
          context: { clipId },
        }),
      })

      if (!res.ok || !res.body) {
        const detail = res.ok ? '' : (await res.text().catch(() => '')).slice(0, 300)
        throw new Error(detail || `Request failed: ${res.status}`)
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setStreaming(accumulated)
      }

      setMessages(prev => [...prev, { role: 'assistant', content: accumulated }])
      setStreaming('')
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Something went wrong'
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${errMsg}` }])
      setStreaming('')
    } finally {
      setIsLoading(false)
    }
  }

  if (!available) {
    return (
      <div className="bg-white border border-[#DDE4ED] shadow-sm rounded-md">
        <div className="px-4 pt-3 pb-2 border-b border-[#DDE4ED]">
          <p
            className="text-xs text-[#3D5166] tracking-widest"
            style={{ fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' }}
          >
            AI Coach Chat
          </p>
        </div>
        <p className="p-4 text-sm text-[#456080]">
          The AI Coach isn&apos;t available for guardians. It&apos;s for the player and their coaches.
        </p>
      </div>
    )
  }

  // ── Agent picker ────────────────────────────────────────────────────────────
  if (!agent) {
    return (
      <div className="bg-white border border-[#DDE4ED] shadow-sm rounded-md p-5 space-y-4">
        <div>
          <p className="text-[10px] tracking-[0.3em] text-[#3D5166] mb-1" style={os} data-ai-badge={role}>
            {aiCoachAudienceBadge(role)}
          </p>
          <p className="text-[10px] text-[#8096AE] mb-1">{aiCoachAudienceEyebrow(role)}</p>
          <p className="text-sm text-[#0F1F33]">Pick who you want to talk to.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {(Object.entries(AGENTS) as [Agent, typeof AGENTS.randy][]).map(([key, ag]) => (
            <button
              key={key}
              onClick={() => chooseAgent(key)}
              className="text-left rounded-xl border-2 p-4 min-h-11 transition-all hover:shadow-md active:scale-[0.98] space-y-2"
              style={{ borderColor: ag.border, background: ag.bg }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="text-lg font-bold leading-none"
                  style={{ color: ag.color, fontFamily: 'var(--font-oswald, Oswald, sans-serif)' }}
                >
                  {ag.name}
                </span>
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded-full text-white"
                  style={{ background: ag.color, fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase', letterSpacing: '0.08em' }}
                >
                  {ag.role}
                </span>
              </div>
              <p className="text-xs text-[#456080] leading-relaxed">{ag.description}</p>
              <p className="text-[10px] font-semibold" style={{ color: ag.color, ...os }}>
                Talk to {ag.name} →
              </p>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Active chat ─────────────────────────────────────────────────────────────
  const ag = AGENTS[agent]

  return (
    <div className="bg-white border border-[#DDE4ED] shadow-sm rounded-md flex flex-col">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-[#DDE4ED] flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] tracking-[0.3em] text-[#3D5166]" style={os} data-ai-badge={role}>
            {aiCoachAudienceBadge(role)}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs font-bold" style={{ color: ag.color, ...os }}>{ag.name}</span>
            <span className="text-[9px] text-[#8096AE] tracking-wide" style={os}>{ag.role}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setAgent(null); setMessages([]) }}
          className="shrink-0 min-h-11 px-3 text-[10px] text-[#8096AE] hover:text-[#456080] transition-colors"
          style={os}
        >
          Switch Agent
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="max-h-[400px] overflow-y-auto p-4 space-y-3">
        <div className="flex justify-start">
          <div className="max-w-[80%] rounded-md px-3 py-2 text-sm text-[#456080]" style={{ background: ag.bg, border: `1px solid ${ag.border}` }}>
            {ag.intro}
          </div>
        </div>

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-md px-3 py-2 text-sm ${msg.role === 'user' ? 'text-white' : 'text-[#456080]'}`}
              style={msg.role === 'user' ? { background: ag.color } : { background: ag.bg, border: `1px solid ${ag.border}` }}
            >
              {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-md px-3 py-2 text-sm text-[#456080]" style={{ background: ag.bg, border: `1px solid ${ag.border}` }}>
              {streaming ? renderMarkdown(streaming) : <span className="animate-pulse">...</span>}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-[#DDE4ED] p-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          placeholder={ag.placeholder}
          disabled={isLoading}
          className="flex-1 text-sm bg-white border border-[#DDE4ED] rounded-md px-3 py-2 text-[#0F1F33] placeholder:text-[#3D5166] focus:outline-none focus:border-[#456080] disabled:opacity-50"
        />
        <button
          onClick={sendMessage}
          disabled={isLoading || !input.trim()}
          className="min-h-11 px-4 py-2 rounded-md text-sm text-white font-medium transition-colors disabled:opacity-40"
          style={{ background: ag.color }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
