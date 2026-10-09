import VideoPlayer from '@/components/video-player'
import ClipTabs from '@/app/clips/[id]/clip-tabs'
import ComparePlayer from '@/app/clips/compare/compare-player'
import AppHeader from '@/components/app-header'
import MobileNav from '@/components/mobile-nav'
import SiteFooter from '@/components/SiteFooter'
import { E2E_CLIP_SRC, E2E_PLAYER_ID } from '@/lib/e2e-clip-fixture'

const fixtureNavItems = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    href: '/clips/compare',
    label: 'Compare Clips',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
      </svg>
    ),
  },
  {
    href: '/profile',
    label: 'Profile',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    href: '/about',
    label: 'About Release Point',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
      </svg>
    ),
  },
]

/** Coach clip page: real VideoPlayer + ClipTabs (toggle, Voice, analysis). */
export function E2eClipCoachPage({ clipId }: { clipId: string }) {
  return (
    <div className="min-h-screen bg-[#F5F7FA]" data-testid="e2e-clip-page">
      <AppHeader
        backHref="/dashboard"
        backLabel="Back to dashboard"
        breadcrumbs={[{ label: 'Fixture clip' }]}
        mobileNav={<MobileNav items={fixtureNavItems} userName="Fixture Coach" userRole="coach" />}
      />
      <main className="max-w-5xl mx-auto px-4 md:px-6 py-5 pb-24">
        <VideoPlayer
          src={E2E_CLIP_SRC}
          clipId={clipId}
          playerId={E2E_PLAYER_ID}
          role="coach"
          canAddMedia
          canRecordLesson={false}
        />
        <div className="mt-4">
          <ClipTabs
            clipId={clipId}
            playerId={E2E_PLAYER_ID}
            role="coach"
            initialNotes={null}
            initialVoiceUrl={null}
            initialTsNotes={[]}
            initialMetrics={[]}
            canDeleteMetrics
            canAddMetrics
            initialChecklist={null}
            initialHittingMetrics={null}
            playerName="Fixture"
            playerAgeGroup="HS"
            playerPosition="P"
            initialClipKind="pitching"
            canEditClipKind
            aiCoachAvailable
            canAddMedia
          />
        </div>
      </main>
      <SiteFooter variant="app" />
    </div>
  )
}

/** Compare page: real ComparePlayer, two local seeded clips. */
export function E2eComparePage({ a, b }: { a: string; b: string }) {
  return (
    <div className="min-h-screen bg-[#F5F7FA]" data-testid="e2e-compare-page">
      <AppHeader
        breadcrumbs={[{ href: '/dashboard', label: 'Dashboard' }, { label: 'Compare' }]}
      />
      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6">
        <ComparePlayer
          clips={[
            { id: a, title: 'Fastball', videoUrl: E2E_CLIP_SRC, playerName: 'Fixture', sessionDate: 'Oct 8, 2026' },
            { id: b, title: 'Changeup', videoUrl: E2E_CLIP_SRC, playerName: 'Fixture', sessionDate: 'Oct 8, 2026' },
          ]}
        />
      </main>
      <SiteFooter variant="app" />
    </div>
  )
}
