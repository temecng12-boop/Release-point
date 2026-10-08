'use client'

/** 44px tap target, speaker icon, Mute / Unmute. Used by the clip and compare players. */
export default function ClipMuteButton({
  muted,
  onToggle,
  className,
}: {
  muted: boolean
  onToggle: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      data-testid="clip-mute"
      aria-label={muted ? 'Unmute' : 'Mute'}
      aria-pressed={muted}
      onClick={onToggle}
      className={className}
      style={{ minWidth: 44, minHeight: 44 }}
    >
      {muted ? (
        <svg aria-hidden="true" className="inline w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
          <path d="M8.5 2.5a.5.5 0 00-.8-.4L4.65 5H2.5A1.5 1.5 0 001 6.5v3A1.5 1.5 0 002.5 11h2.15l3.05 2.9a.5.5 0 00.8-.4v-11z" />
          <path d="M11.15 6.15a.5.5 0 01.7 0L13 7.29l1.15-1.14a.5.5 0 11.7.7L13.71 8l1.14 1.15a.5.5 0 11-.7.7L13 8.71l-1.15 1.14a.5.5 0 11-.7-.7L12.29 8l-1.14-1.15a.5.5 0 010-.7z" />
        </svg>
      ) : (
        <svg aria-hidden="true" className="inline w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
          <path d="M8.5 2.5a.5.5 0 00-.8-.4L4.65 5H2.5A1.5 1.5 0 001 6.5v3A1.5 1.5 0 002.5 11h2.15l3.05 2.9a.5.5 0 00.8-.4v-11z" />
          <path d="M10.8 5.2a.5.5 0 01.7.05 3.5 3.5 0 010 5.5.5.5 0 11-.75-.66 2.5 2.5 0 000-4.18.5.5 0 01.05-.71z" />
          <path d="M12.1 3.6a.5.5 0 01.7.1 6 6 0 010 8.6.5.5 0 11-.8-.6 5 5 0 000-7.4.5.5 0 01.1-.7z" />
        </svg>
      )}
    </button>
  )
}
