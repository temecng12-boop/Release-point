'use client'

import { useRef } from 'react'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

const LEGENDS = [
  {
    name: 'Nolan Ryan',
    teams: 'Angels · Astros · Rangers · Mets',
    era: '1966–1993',
    stat: '5,714 K\'s',
    statLabel: 'Career Strikeouts',
    accent: '#C8102E',
    bg: 'linear-gradient(135deg, #0F1F33 0%, #1a0a0a 100%)',
  },
  {
    name: 'Pedro Martinez',
    teams: 'Red Sox · Expos · Mets',
    era: '1992–2009',
    stat: '2.93',
    statLabel: 'Career ERA',
    accent: '#BD3039',
    bg: 'linear-gradient(135deg, #0a0f1a 0%, #1C3A5C 100%)',
  },
  {
    name: 'Roger Clemens',
    teams: 'Red Sox · Yankees · Astros',
    era: '1984–2007',
    stat: '354 W',
    statLabel: 'Career Wins',
    accent: '#C8102E',
    bg: 'linear-gradient(135deg, #0d1117 0%, #1C3A5C 100%)',
  },
  {
    name: 'Roy Halladay',
    teams: 'Blue Jays · Phillies',
    era: '1998–2013',
    stat: '203 W',
    statLabel: 'Career Wins',
    accent: '#003DA5',
    bg: 'linear-gradient(135deg, #001a40 0%, #003DA5 80%, #0d1117 100%)',
  },
  {
    name: 'Tim Lincecum',
    teams: 'San Francisco Giants',
    era: '2007–2016',
    stat: '2× CY',
    statLabel: 'Cy Young Awards',
    accent: '#FD5A1E',
    bg: 'linear-gradient(135deg, #0d1117 0%, #1a2b1a 100%)',
  },
  {
    name: 'Jacob deGrom',
    teams: 'Mets · Rangers',
    era: '2014–present',
    stat: '2.52',
    statLabel: 'Career ERA',
    accent: '#002D72',
    bg: 'linear-gradient(135deg, #001a40 0%, #002D72 100%)',
  },
  {
    name: 'Gerrit Cole',
    teams: 'Pirates · Astros · Yankees',
    era: '2013–present',
    stat: '3.17',
    statLabel: 'Career ERA',
    accent: '#003087',
    bg: 'linear-gradient(135deg, #000a1a 0%, #003087 100%)',
  },
  {
    name: 'Aroldis Chapman',
    teams: 'Reds · Cubs · Yankees',
    era: '2010–present',
    stat: '105+ mph',
    statLabel: 'Fastest Pitch Recorded',
    accent: '#C8102E',
    bg: 'linear-gradient(135deg, #0a0010 0%, #1C0040 100%)',
  },
  {
    name: 'Trevor Bauer',
    teams: 'Reds · Dodgers · Indians',
    era: '2012–2021',
    stat: 'CY 2020',
    statLabel: 'Cy Young Award',
    accent: '#C6011F',
    bg: 'linear-gradient(135deg, #0d1117 0%, #1a0a00 100%)',
  },
  {
    name: 'Paul Skenes',
    teams: 'Pittsburgh Pirates',
    era: '2024–present',
    stat: '100+ mph',
    statLabel: 'Avg Fastball',
    accent: '#FDB827',
    bg: 'linear-gradient(135deg, #0a0510 0%, #1a0a00 100%)',
  },
]

export default function PitcherLegends() {
  const scrollRef = useRef<HTMLDivElement>(null)

  function scroll(dir: 'left' | 'right') {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir === 'left' ? -280 : 280, behavior: 'smooth' })
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] tracking-[0.3em] text-[#C8102E]" style={oswald}>Study the Greats</p>
        <div className="flex gap-1.5">
          <button
            onClick={() => scroll('left')}
            className="w-7 h-7 rounded-full bg-white border border-[#DDE4ED] flex items-center justify-center text-[#456080] hover:bg-[#F0F4F8] transition-colors min-h-0"
          >
            ‹
          </button>
          <button
            onClick={() => scroll('right')}
            className="w-7 h-7 rounded-full bg-white border border-[#DDE4ED] flex items-center justify-center text-[#456080] hover:bg-[#F0F4F8] transition-colors min-h-0"
          >
            ›
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide pb-1"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {LEGENDS.map(legend => (
          <div
            key={legend.name}
            className="relative shrink-0 w-48 rounded-xl overflow-hidden border border-white/10 shadow-md"
            style={{ background: legend.bg, scrollSnapAlign: 'start' }}
          >
            {/* Top accent bar */}
            <div className="h-1" style={{ background: legend.accent }} />

            <div className="p-4">
              {/* Number placeholder - decorative */}
              <div
                className="text-6xl font-bold leading-none mb-2 select-none"
                style={{ color: 'rgba(255,255,255,0.05)', fontFamily: 'var(--font-oswald, Oswald, sans-serif)' }}
                aria-hidden
              >
                {legend.stat.replace(/[^0-9]/g, '').slice(0, 2) || '⚾'}
              </div>

              <p className="text-[10px] tracking-[0.2em] mb-1" style={{ color: legend.accent, ...oswald }}>
                {legend.era}
              </p>
              <p className="text-base text-white leading-tight mb-3" style={oswald}>
                {legend.name}
              </p>
              <p className="text-xs text-white/50 leading-tight mb-3">{legend.teams}</p>

              <div className="pt-3 border-t border-white/10">
                <p className="text-lg text-white leading-none" style={oswald}>{legend.stat}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{legend.statLabel}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
