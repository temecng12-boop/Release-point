import { ImageResponse } from 'next/og'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  const imgPath = path.join(process.cwd(), 'public', 'rp-icon.png')
  const imgBuffer = fs.readFileSync(imgPath)
  const base64 = imgBuffer.toString('base64')
  const dataUrl = `data:image/png;base64,${base64}`

  // Logo is 665×347 (aspect ~1.916). At 50% of 180px canvas = 90px wide, 47px tall
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          backgroundColor: '#0F1F33',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUrl} width={90} height={47} alt="" />
      </div>
    ),
    { width: 180, height: 180 }
  )
}
