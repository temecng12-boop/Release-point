import VideoPlayer from '@/components/video-player'
import ComparePlayer from '@/app/clips/compare/compare-player'
import AppHeader from '@/components/app-header'
import SiteFooter from '@/components/SiteFooter'
import { E2E_CLIP_SRC, E2E_PLAYER_ID } from '@/lib/e2e-clip-fixture'

/** Coach clip page: real VideoPlayer + VoiceNote, local seeded clip. */
export function E2eClipCoachPage({ clipId }: { clipId: string }) {
  return (
    <div className="min-h-screen bg-[#F5F7FA]" data-testid="e2e-clip-page">
      <AppHeader
        backHref="/dashboard"
        backLabel="Back to dashboard"
        breadcrumbs={[{ label: 'Fixture clip' }]}
      />
      <main className="max-w-5xl mx-auto px-4 md:px-6 py-5 pb-24">
        <VideoPlayer
          src={E2E_CLIP_SRC}
          clipId={clipId}
          playerId={E2E_PLAYER_ID}
          role="coach"
        />
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
