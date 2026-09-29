'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

interface Clip {
  id: string
  title: string
  playerName: string
  sessionDate: string
}

interface YTResult {
  id: string
  title: string
  channel: string
  thumbnail: string
}

interface Props {
  sourceClipId: string
  sourceClipTitle: string
  clips: Clip[]
  targetSlot?: 'b' | 'c' | 'd'
  existingParams?: Partial<Record<'a' | 'b' | 'c' | 'd', string>>
}

export default function ClipPicker({ sourceClipId, sourceClipTitle, clips, targetSlot = 'b', existingParams }: Props) {
  const router = useRouter()
  const [query, setQuery]           = useState('')
  const [ytResults, setYtResults]   = useState<YTResult[]>([])
  const [searching, setSearching]   = useState(false)
  const [searchErr, setSearchErr]   = useState('')
  const [ytUrl, setYtUrl]           = useState('')
  const [ytError, setYtError]       = useState('')
  const [tab, setTab]               = useState<'search' | 'url' | 'library'>('search')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function buildUrl(slotValue: string): string {
    const params = new URLSearchParams()
    params.set('a', sourceClipId)
    if (existingParams) {
      const slots = ['b', 'c', 'd'] as const
      for (const slot of slots) {
        if (slot !== targetSlot && existingParams[slot]) params.set(slot, existingParams[slot]!)
      }
    }
    params.set(targetSlot, slotValue)
    return `/clips/compare?${params.toString()}`
  }

  async function runSearch(q: string) {
    if (!q.trim()) { setYtResults([]); return }
    setSearching(true)
    setSearchErr('')
    try {
      const res = await fetch(`/api/youtube-search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (data.error) { setSearchErr('Search unavailable. Paste a URL instead.'); setYtResults([]) }
      else setYtResults(data.items ?? [])
    } catch {
      setSearchErr('Search unavailable. Paste a URL instead.')
    } finally {
      setSearching(false)
    }
  }

  function handleQueryChange(val: string) {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(val), 500)
  }

  function handleYouTube() {
    const id = extractYouTubeId(ytUrl.trim())
    if (!id) { setYtError('Paste a valid YouTube or Shorts URL'); return }
    router.push(buildUrl(`yt:${id}`))
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      {/* Source clip label */}
      <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
        <div className="h-1 bg-[#C8102E]" />
        <div className="p-4">
          <p className="text-[10px] tracking-[0.3em] text-[#C8102E] mb-0.5" style={oswald}>Comparing with</p>
          <p className="text-sm text-[#0F1F33] font-medium" style={oswald}>{sourceClipTitle}</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex rounded-xl overflow-hidden border border-[#DDE4ED] bg-white shadow-sm">
        {([
          { key: 'search',  label: 'Search YouTube' },
          { key: 'url',     label: 'Paste URL' },
          { key: 'library', label: 'My Clips' },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 text-[11px] transition-colors ${tab === t.key ? 'bg-[#C8102E] text-white' : 'text-[#456080] hover:bg-[#F0F4F8]'}`}
            style={oswald}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search YouTube */}
      {tab === 'search' && (
        <div className="bg-white border border-[#DDE4ED] rounded-xl shadow-sm overflow-hidden">
          {/* YouTube-style search bar */}
          <div className="px-4 pt-4 pb-3 border-b border-[#DDE4ED]">
            <div className="flex items-center gap-3 mb-3">
              <svg className="w-5 h-3.5 shrink-0" viewBox="0 0 90 20" fill="none">
                <path d="M27.9727 3.12324C27.6435 1.89323 26.6768 0.926623 25.4468 0.597366C23.2197 0 14.285 0 14.285 0C14.285 0 5.35042 0 3.12323 0.597366C1.89323 0.926623 0.926623 1.89323 0.597366 3.12324C0 5.35042 0 10 0 10C0 10 0 14.6496 0.597366 16.8768C0.926623 18.1068 1.89323 19.0734 3.12323 19.4026C5.35042 20 14.285 20 14.285 20C14.285 20 23.2197 20 25.4468 19.4026C26.6768 19.0734 27.6435 18.1068 27.9727 16.8768C28.5701 14.6496 28.5701 10 28.5701 10C28.5701 10 28.5677 5.35042 27.9727 3.12324Z" fill="#FF0000"/>
                <path d="M11.4253 14.2854L18.8477 10.0004L11.4253 5.71533V14.2854Z" fill="white"/>
                <path d="M34.6024 13.0036L31.3945 1.41846H34.1932L35.3174 6.6886C35.6043 7.96361 35.8136 9.06662 35.952 9.99062H36.0348C36.1261 9.32662 36.3399 8.22662 36.6771 6.71761L37.8839 1.41846H40.6826L37.4747 13.0036V18.561H34.6001V13.0036H34.6024Z" fill="#282828"/>
                <path d="M41.4697 18.1937C40.9121 17.8571 40.5074 17.3283 40.2461 16.6071C39.9802 15.8859 39.8496 14.9595 39.8496 13.8141V12.061C39.8496 10.9156 39.9923 9.98112 40.2783 9.25162C40.5643 8.52162 41.0015 7.98712 41.5924 7.64762C42.1833 7.30812 42.9447 7.13837 43.8764 7.13837C44.7937 7.13837 45.5431 7.30812 46.1196 7.64762C46.696 7.98712 47.1214 8.52162 47.3949 9.25162C47.6704 9.98112 47.807 10.9156 47.807 12.061V13.8141C47.807 14.9595 47.6724 15.8882 47.4064 16.6071C47.1382 17.3283 46.7156 17.8594 46.1432 18.1937C45.5709 18.5282 44.8115 18.6954 43.8764 18.6954C42.9217 18.6978 42.1476 18.5282 41.4697 18.1937ZM44.9658 16.2515C45.1324 15.7803 45.2157 15.0651 45.2157 14.1213V11.749C45.2157 10.8241 45.1324 10.1161 44.9658 9.62987C44.7991 9.14362 44.4951 8.90237 44.0374 8.90237C43.5936 8.90237 43.2958 9.14362 43.1412 9.62987C42.9866 10.1161 42.9034 10.8241 42.9034 11.749V14.1213C42.9034 15.0651 42.9842 15.7803 43.1505 16.2515C43.3171 16.7228 43.6151 16.9571 44.0374 16.9571C44.4765 16.9571 44.7991 16.7228 44.9658 16.2515Z" fill="#282828"/>
                <path d="M56.8154 18.5618H54.6509L54.4116 17.0686H54.3479C53.6937 18.1755 52.7971 18.7297 51.6566 18.7297C50.8425 18.7297 50.2396 18.4682 49.8587 17.9419C49.4778 17.4156 49.2905 16.6137 49.2905 15.5373V7.29821H52.0732V15.3752C52.0732 15.8798 52.1364 16.2417 52.2652 16.4709C52.3939 16.7001 52.5958 16.8146 52.8787 16.8146C53.1206 16.8146 53.354 16.7383 53.5791 16.5834C53.8043 16.4285 53.9711 16.2417 54.0856 16.0105V7.29821H56.8154V18.5618Z" fill="#282828"/>
                <path d="M64.4755 3.68758V18.5629H62.2221L61.9585 17.0325H61.9107C61.2119 18.1768 60.2937 18.7491 59.1558 18.7491C58.3173 18.7491 57.7006 18.4538 57.3105 17.8509C56.9203 17.2481 56.7214 16.3361 56.7214 15.1149V10.2984C56.7214 9.07725 56.9203 8.16225 57.3105 7.55225C57.7006 6.94225 58.3243 6.64 59.1558 6.64C60.2445 6.64 61.1301 7.18525 61.9107 8.27275V3.68758H64.4755ZM61.9107 15.7381V9.76458C61.7979 9.53483 61.6387 9.34758 61.4372 9.2013C61.2356 9.05505 61.0297 8.98308 60.8253 8.98308C60.5924 8.98308 60.4066 9.0758 60.2725 9.26508C60.1384 9.45208 60.0693 9.74683 60.0693 10.1498V15.2145C60.0693 15.6175 60.1384 15.9108 60.2725 16.0988C60.4066 16.2891 60.5862 16.3818 60.8253 16.3818C61.0297 16.3818 61.2356 16.3098 61.4372 16.1635C61.6387 16.0173 61.7979 15.8298 61.9107 15.7381Z" fill="#282828"/>
                <path d="M71.0146 13.0645V14.0127C71.0146 14.5444 71.0337 14.9477 71.0791 15.2176C71.1245 15.4899 71.2112 15.688 71.3353 15.8232C71.4595 15.956 71.6393 16.0236 71.8763 16.0236C72.1978 16.0236 72.4215 15.9064 72.5544 15.672C72.6874 15.4376 72.7584 15.0576 72.773 14.5221L75.1471 14.6659C75.1615 14.7751 75.1687 14.9167 75.1687 15.0941C75.1687 16.1974 74.8638 17.0341 74.254 17.6014C73.6442 18.1709 72.7906 18.4532 71.6985 18.4532C70.3757 18.4532 69.4517 18.0422 68.9228 17.2178C68.3939 16.3934 68.1271 15.1469 68.1271 13.4784V11.3937C68.1271 9.67583 68.4015 8.4082 68.9527 7.58395C69.5039 6.75745 70.4448 6.3457 71.7745 6.3457C72.6633 6.3457 73.3618 6.51545 73.8678 6.85495C74.3738 7.19445 74.7386 7.69145 74.9596 8.34595C75.1806 9.00045 75.2887 9.87245 75.2887 10.962V13.0645H71.0146ZM71.3259 8.23345C71.2112 8.36595 71.1245 8.56175 71.0791 8.82835C71.0337 9.09495 71.0146 9.49045 71.0146 10.014V11.0499H72.8025V10.014C72.8025 9.50145 72.7804 9.1037 72.7443 8.82835C72.7059 8.55075 72.6154 8.35495 72.4935 8.23345C72.3716 8.11195 72.1978 8.0507 71.9752 8.0507C71.7449 8.04845 71.5711 8.11195 71.3259 8.23345Z" fill="#282828"/>
                <path d="M83.1735 7.29821V9.07121H80.9785V18.5618H78.1958V9.07121H75.9985V7.29821H83.1735Z" fill="#282828"/>
                <path d="M84.4123 18.1937C83.8547 17.8571 83.45 17.3283 83.1887 16.6071C82.9228 15.8859 82.7922 14.9595 82.7922 13.8141V12.061C82.7922 10.9156 82.9349 9.98112 83.2209 9.25162C83.5069 8.52162 83.9441 7.98712 84.535 7.64762C85.1259 7.30812 85.8873 7.13837 86.819 7.13837C87.7363 7.13837 88.4857 7.30812 89.0622 7.64762C89.6386 7.98712 90.064 8.52162 90.3375 9.25162C90.613 9.98112 90.7496 10.9156 90.7496 12.061V13.8141C90.7496 14.9595 90.615 15.8882 90.349 16.6071C90.0808 17.3283 89.6582 17.8594 89.0858 18.1937C88.5135 18.5282 87.7541 18.6954 86.819 18.6954C85.8643 18.6978 85.0902 18.5282 84.4123 18.1937ZM87.9084 16.2515C88.075 15.7803 88.1583 15.0651 88.1583 14.1213V11.749C88.1583 10.8241 88.075 10.1161 87.9084 9.62987C87.7417 9.14362 87.4377 8.90237 86.98 8.90237C86.5362 8.90237 86.2384 9.14362 86.0838 9.62987C85.9292 10.1161 85.846 10.8241 85.846 11.749V14.1213C85.846 15.0651 85.9268 15.7803 86.0931 16.2515C86.2597 16.7228 86.5577 16.9571 86.98 16.9571C87.4191 16.9571 87.7417 16.7228 87.9084 16.2515Z" fill="#282828"/>
              </svg>
              <span className="text-[11px] text-[#8096AE]" style={oswald}>Search YouTube</span>
            </div>
            <div className="relative">
              <input
                autoFocus
                type="text"
                value={query}
                onChange={e => handleQueryChange(e.target.value)}
                placeholder="Search pitchers, hitters, drills, mechanics…"
                className="w-full text-sm bg-[#F8FAFC] border border-[#DDE4ED] rounded-full px-4 py-2.5 pr-10 text-[#0F1F33] placeholder:text-[#AAB8C8] focus:outline-none focus:border-[#456080]"
              />
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8096AE]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {searching && (
            <div className="px-4 py-10 text-center">
              <div className="w-5 h-5 border-2 border-[#FF0000] border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          )}

          {searchErr && !searching && (
            <p className="px-4 py-4 text-xs text-[#C8102E]">{searchErr}</p>
          )}

          {!searching && ytResults.length > 0 && (
            <div className="p-3 grid grid-cols-2 gap-3">
              {ytResults.map(r => (
                <button
                  key={r.id}
                  onClick={() => router.push(buildUrl(`yt:${r.id}`))}
                  className="group text-left rounded-lg overflow-hidden transition-all hover:ring-2 hover:ring-[#FF0000] hover:ring-offset-1"
                >
                  <div className="relative w-full bg-black" style={{ paddingBottom: '56.25%' }}>
                    <Image src={r.thumbnail} alt={r.title} fill className="object-cover" unoptimized />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-[#FF0000]/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div className="pt-2 pb-1 px-0.5">
                    <p className="text-[11px] text-[#0F1F33] line-clamp-2 leading-snug group-hover:text-[#FF0000] transition-colors">{r.title}</p>
                    <p className="text-[10px] text-[#8096AE] mt-0.5 truncate">{r.channel}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!searching && !searchErr && ytResults.length === 0 && query.length === 0 && (
            <div className="px-4 py-10 text-center">
              <svg className="w-10 h-10 mx-auto mb-3 opacity-20" viewBox="0 0 24 24" fill="#FF0000">
                <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              <p className="text-sm text-[#8096AE]">Search YouTube for a pitcher, hitter, drill, or mechanic.</p>
              <p className="text-xs text-[#AAB8C8] mt-1">Works with YouTube Shorts too.</p>
            </div>
          )}

          {!searching && !searchErr && ytResults.length === 0 && query.length > 0 && (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-[#8096AE]">No results for &ldquo;{query}&rdquo;</p>
            </div>
          )}
        </div>
      )}

      {/* Paste URL */}
      {tab === 'url' && (
        <div className="bg-white border border-[#DDE4ED] rounded-xl shadow-sm p-4 space-y-3">
          <p className="text-xs text-[#456080]">Paste any YouTube or Shorts link.</p>
          <div className="flex gap-2">
            <input
              autoFocus
              type="url"
              value={ytUrl}
              onChange={e => { setYtUrl(e.target.value); setYtError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleYouTube() }}
              placeholder="https://youtube.com/watch?v=… or youtu.be/…"
              className="flex-1 text-sm bg-white border border-[#DDE4ED] rounded-lg px-3 py-2.5 text-[#0F1F33] placeholder:text-[#AAB8C8] focus:outline-none focus:border-[#456080]"
            />
            <button
              onClick={handleYouTube}
              className="text-xs bg-[#C8102E] hover:bg-[#9E0E24] text-white px-4 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0"
              style={oswald}
            >
              Load
            </button>
          </div>
          {ytError && <p className="text-xs text-[#C8102E]">{ytError}</p>}
        </div>
      )}

      {/* Library clips */}
      {tab === 'library' && (
        clips.length === 0 ? (
          <div className="bg-white border border-[#DDE4ED] rounded-xl px-6 py-12 text-center shadow-sm">
            <p className="text-sm text-[#3D5166]">No other clips to compare against yet.</p>
          </div>
        ) : (
          <div className="bg-white border border-[#DDE4ED] rounded-xl divide-y divide-[#DDE4ED] overflow-hidden shadow-sm">
            {clips.map(clip => (
              <button
                key={clip.id}
                onClick={() => router.push(buildUrl(clip.id))}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-[#F0F4F8] transition-colors group text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm text-[#0F1F33] truncate group-hover:text-[#C8102E] transition-colors">{clip.title}</p>
                  <p className="text-xs text-[#3D5166] mt-0.5">{clip.playerName} · {clip.sessionDate}</p>
                </div>
                <svg className="w-4 h-4 text-[#DDE4ED] group-hover:text-[#C8102E] transition-colors shrink-0 ml-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        )
      )}

      <div className="text-center">
        <Link href={`/clips/${sourceClipId}`} className="text-xs text-[#3D5166] hover:text-[#456080] transition-colors" style={oswald}>
          Back to clip
        </Link>
      </div>
    </div>
  )
}
