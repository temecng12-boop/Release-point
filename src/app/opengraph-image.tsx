import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Social preview, generated at build time: navy/red/white, the mark
// lettering, "See Every Pitch Differently.", and a frame from /media.
// Only the windup frame is embedded (the icon PNG + JPEG together blew
// the 500KB ImageResponse budget and crashed the route).
export const alt = 'Release Point AI: video coaching for pitchers and hitters'
export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

export default async function Image() {
  const buf = await readFile(join(process.cwd(), 'public', 'media', 'nolan-windup.jpg'))
  const frame = `data:image/jpeg;base64,${buf.toString('base64')}`

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
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            width: 640,
            paddingLeft: 88,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: 28,
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                background: '#C8031E',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 28,
                fontWeight: 800,
                marginRight: 16,
              }}
            >
              RP
            </div>
            <p
              style={{
                fontSize: 22,
                letterSpacing: 5,
                color: '#8FA3B8',
                margin: 0,
              }}
            >
              RELEASE POINT AI
            </p>
          </div>
          <p style={{ fontSize: 76, lineHeight: 0.95, fontWeight: 800, margin: 0 }}>
            See Every
          </p>
          <p style={{ fontSize: 76, lineHeight: 0.95, fontWeight: 800, margin: 0 }}>
            Pitch
          </p>
          <p style={{ fontSize: 76, lineHeight: 0.95, fontWeight: 800, margin: '0 0 26px 0' }}>
            Differently.
          </p>
          <div style={{ width: 120, height: 8, background: '#C8031E' }} />
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            padding: 48,
          }}
        >
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
