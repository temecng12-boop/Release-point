import Image from 'next/image'
import Link from 'next/link'

interface Props {
  size?: 'sm' | 'md' | 'lg'
  href?: string
  className?: string
  wordmarkClass?: string
}

const oswald: React.CSSProperties = {
  fontFamily: 'var(--font-oswald, Oswald, sans-serif)',
  textTransform: 'uppercase',
  fontWeight: 700,
}

// rp-icon.png native dimensions: 665 × 347 (ratio 1.916)
const iconH  = { sm: 30, md: 38, lg: 52 }
const wordSz = { sm: 11, md: 13, lg: 18 }

export default function Logo({
  size = 'sm',
  href,
  className = '',
  wordmarkClass = 'hidden sm:inline',
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
        style={{ ...oswald, fontSize: wordSz[size], letterSpacing: '0.15em', color: '#1C2E4A' }}
      >
        Release Point
      </span>
    </div>
  )

  if (href) return <Link href={href}>{mark}</Link>
  return mark
}
