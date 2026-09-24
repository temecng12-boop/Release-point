import { ImageResponse } from 'next/og'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  const imgPath = path.join(process.cwd(), 'public', 'rp-icon.png')
  const imgBuffer = fs.readFileSync(imgPath)
  const base64 = imgBuffer.toString('base64')
  const dataUrl = `data:image/png;base64,${base64}`

  // Logo is 665×347 (aspect ~1.916). At 50% of 512px canvas = 256px wide, 134px tall
  return new ImageResponse(
    (
      <div
        style={{
          width: 512,
          height: 512,
          backgroundColor: '#0F1F33',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUrl} width={256} height={134} alt="" />
      </div>
    ),
    { width: 512, height: 512 }
  )
}
