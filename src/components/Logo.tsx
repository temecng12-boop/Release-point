import Image from 'next/image'
import Link from 'next/link'

interface Props {
  size?: 'sm' | 'md' | 'lg'
  href?: string
  className?: string
  wordmarkClass?: string
  dark?: boolean
}

const oswald: React.CSSProperties = {
  fontFamily: 'var(--font-oswald, Oswald, sans-serif)',
  textTransform: 'uppercase',
  fontWeight: 700,
}

// rp-icon.png native dimensions: 665 × 347 (ratio 1.916)
const iconH  = { sm: 28, md: 34, lg: 48 }
const wordSz = { sm: 11, md: 13, lg: 18 }

export default function Logo({
  size = 'sm',
  href,
  className = '',
  wordmarkClass = 'hidden sm:inline',
  dark = false,
}: Props) {
  const h = iconH[size]
  const w = Math.round(h * 1.916)

  const mark = (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <Image
        src="/rp-icon.png"
        alt="Release Point"
        width={w}
        height={h}
        className="object-contain"
        priority
      />
      <span
        className={wordmarkClass}
        style={{
          ...oswald,
          fontSize: wordSz[size],
          letterSpacing: '0.15em',
          color: dark ? '#94a3b8' : '#0f172a',
        }}
      >
        Release Point
      </span>
    </div>
  )

  if (href) return <Link href={href}>{mark}</Link>
  return mark
}
