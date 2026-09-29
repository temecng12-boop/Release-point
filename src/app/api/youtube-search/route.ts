import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ items: [] })

  const key = process.env.YOUTUBE_API_KEY
  if (!key) return NextResponse.json({ error: 'YouTube API not configured' }, { status: 500 })

  const url = new URL('https://www.googleapis.com/youtube/v3/search')
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('type', 'video')
  url.searchParams.set('maxResults', '6')
  url.searchParams.set('q', q)
  url.searchParams.set('key', key)

  const res = await fetch(url.toString(), { next: { revalidate: 300 } })
  if (!res.ok) return NextResponse.json({ error: 'YouTube API error' }, { status: 502 })

  const data = await res.json()
  const items = (data.items ?? []).map((item: {
    id: { videoId: string }
    snippet: { title: string; channelTitle: string; thumbnails: { medium?: { url: string }; default?: { url: string } } }
  }) => ({
    id: item.id.videoId,
    title: item.snippet.title,
    channel: item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails.medium?.url ?? item.snippet.thumbnails.default?.url ?? '',
  }))

  return NextResponse.json({ items })
}
