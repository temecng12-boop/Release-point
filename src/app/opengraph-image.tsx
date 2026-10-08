import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Social preview, generated statically at build time: navy/red/white, the
// mark, the "See Every Pitch Differently." tagline, and a frame from
// /media. If Design ships a final PNG, replace this file with
// `opengraph-image.png` (same tags are emitted) and delete this route.
export const alt = 'Release Point AI: video coaching for pitchers and hitters'
export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

async function dataUrl(file: string, mime: string): Promise<string> {
  const buf = await readFile(join(process.cwd(), 'public', file))
  return `data:${mime};base64,${buf.toString('base64')}`
}

export default async function Image() {
  const [frame, mark] = await Promise.all([
    dataUrl('media/nolan-windup.jpg', 'image/jpeg'),
    dataUrl('rp-icon.png', 'image/png'),
  ])

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#0A0E16',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Left: brand + tagline */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            width: 640,
            padding: '0 0 0 88',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mark} alt="" width={120} height={75} style={{ marginBottom: 28 }} />
          <p style={{ fontSize: 26, letterSpacing: 6, color: '#8FA3B8', margin: '0 0 18 0' }}>
            RELEASE POINT AI
          </p>
          <p style={{ fontSize: 84, lineHeight: 0.95, fontWeight: 800, margin: '0 0 26 0' }}>
            See Every
            <br />
            Pitch
            <br />
            Differently.
          </p>
          <div style={{ width: 120, height: 8, background: '#C8031E' }} />
        </div>
        {/* Right: product frame */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            padding: 48,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={frame}
            alt=""
            width={440}
            height={534}
            style={{ objectFit: 'cover', borderRadius: 20, border: '1px solid rgba(255,255,255,0.15)' }}
          />
        </div>
      </div>
    ),
    {
      ...size,
    },
  )
}
