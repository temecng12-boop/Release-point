'use client'

import { useEffect, useRef, useState } from 'react'

type Message = { role: 'user' | 'assistant'; content: string }
type Metric  = { id: string; pitch_type: string | null; velocity: number | null; spin_rate: number | null; spin_axis: number | null; horizontal_break: number | null; vertical_break: number | null }

export default function AIChat({
  clipId,
  role,
  playerName,
  playerAgeGroup,
  playerPosition,
  metrics = [],
}: {
  clipId: string
  role: 'coach' | 'player'
  playerName: string
  playerAgeGroup: string | null
  playerPosition: string | null
  metrics?: Metric[]
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when messages or streaming text changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streaming])

  async function sendMessage() {
    const text = input.trim()
    if (!text || isLoading) return

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
          context: {
            playerName,
            ageGroup: playerAgeGroup,
            position: playerPosition,
            clipId,
            viewerRole: role,
            metrics,
          },
        }),
      })

      if (!res.ok || !res.body) {
        throw new Error(`Request failed: ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        accumulated += chunk
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="bg-[#0B1E36] border border-[#1C3A5C] rounded-md flex flex-col">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-[#1C3A5C]">
        <p
          className="text-xs text-[#4A6880] tracking-widest"
          style={{ fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' }}
        >
          AI Coach Chat
        </p>
      </div>

      {/* Message list */}
      <div ref={scrollRef} className="max-h-[400px] overflow-y-auto p-4 space-y-3">
        {/* Intro message */}
        <div className="flex justify-start">
          <div
            className="max-w-[80%] rounded-md px-3 py-2 text-sm text-[#E8EDF5]"
            style={{ background: '#0B1E36', border: '1px solid #1C3A5C' }}
          >
            Ask me anything about this clip, player mechanics, or what to work on.
          </div>
        </div>

        {/* Conversation */}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-md px-3 py-2 text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'text-white'
                  : 'text-[#E8EDF5]'
              }`}
              style={
                msg.role === 'user'
                  ? { background: '#C8102E' }
                  : { background: '#0B1E36', border: '1px solid #1C3A5C' }
              }
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Streaming response */}
        {isLoading && (
          <div className="flex justify-start">
            <div
              className="max-w-[80%] rounded-md px-3 py-2 text-sm text-[#E8EDF5] whitespace-pre-wrap"
              style={{ background: '#0B1E36', border: '1px solid #1C3A5C' }}
            >
              {streaming || (
                <span className="text-[#4A6880]">
                  <span className="animate-pulse">...</span>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-[#1C3A5C] p-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about mechanics, pitch design, development…"
          disabled={isLoading}
          className="flex-1 text-sm bg-[#060F1A] border border-[#1C3A5C] rounded-md px-3 py-2 text-[#E8EDF5] placeholder:text-[#4A6880] focus:outline-none focus:border-[#9FB3CC] disabled:opacity-50"
        />
        <button
          onClick={sendMessage}
          disabled={isLoading || !input.trim()}
          className="px-4 py-2 rounded-md text-sm text-white font-medium transition-colors disabled:opacity-40"
          style={{ background: '#C8102E' }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
