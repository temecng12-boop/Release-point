'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import InviteForm from '@/app/dashboard/invite-form'
import EditPlayerModal from '@/app/dashboard/edit-player-modal'
import ClipKindToggle from '@/app/clips/[id]/clip-kind-toggle'

const SAMPLE_PLAYER = {
  id: '00000000-0000-4000-8000-000000000001',
  full_name: 'Jordan Reyes',
  age_group: 'High School',
  position: 'pitcher' as string | null,
  positions: ['catcher', 'hitter'] as string[],
  teamIds: [] as string[],
}

function Shot() {
  const shot = useSearchParams().get('shot') ?? 'invite'
  return (
    <main className="min-h-screen bg-[#F4F7FB] px-4 py-6">
      {shot === 'invite' && (
        <section data-shot="invite">
          <h1 className="text-sm text-[#456080] mb-3">Coach invite</h1>
          <InviteForm teams={[]} />
        </section>
      )}
      {shot === 'edit' && (
        <section data-shot="edit-player">
          <EditPlayerModal player={SAMPLE_PLAYER} teams={[]} onClose={() => {}} />
        </section>
      )}
      {shot === 'toggle' && (
        <section data-shot="clip-toggle" className="bg-white rounded-xl border border-[#DDE4ED] p-4 max-w-md">
          <h1 className="text-sm text-[#456080] mb-3">Clip toggle</h1>
          <ClipKindToggle clipId="shot" value="pitching" canEdit />
        </section>
      )}
    </main>
  )
}

export default function PositionsShotPage() {
  return (
    <Suspense>
      <Shot />
    </Suspense>
  )
}
