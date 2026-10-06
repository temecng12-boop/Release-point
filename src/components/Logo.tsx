import Image from 'next/image'
import Link from 'next/link'

interface Props {
  size?: 'sm' | 'md' | 'lg'
  href?: string
  className?: string
  /** Tailwind classes for the wordmark span. Default: mark-only below 480px. */
  wordmarkClass?: string
  dark?: boolean
}

const oswald: React.CSSProperties = {
  fontFamily: 'var(--font-oswald, Oswald, sans-serif)',
  textTransform: 'uppercase',
  fontWeight: 700,
}

// rp-mark-small-color.svg viewBox aspect ≈ 1.61 (same family as the old PNG).
const iconH  = { sm: 28, md: 34, lg: 48 }

export default function Logo({
  size = 'sm',
  href,
  className = '',
  // Design: mark-only <480px; one-line wordmark from 480 up (mobile-wordmark-fix.md).
  wordmarkClass = 'hidden min-[480px]:inline whitespace-nowrap',
  dark = false,
}: Props) {
  const h = iconH[size]
  const w = Math.round(h * 1.610)

  const mark = (
    <div className={`inline-flex items-center gap-2.5 shrink-0 ${className}`}>
      <Image
        src="/rp-mark-small-color.svg"
        alt="Release Point"
        width={w}
        height={h}
        className="object-contain"
        priority
      />
      <span
        aria-hidden="true"
        className={wordmarkClass}
        style={{
          ...oswald,
          fontSize: 'clamp(12px, 2.4vw, 14px)',
          letterSpacing: '0.15em',
          color: dark ? '#94a3b8' : 'var(--rp-navy, #023167)',
        }}
      >
        Release Point
      </span>
    </div>
  )

  if (href) return <Link href={href}>{mark}</Link>
  return mark
}
