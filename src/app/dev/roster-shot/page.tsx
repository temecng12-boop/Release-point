'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import AddPlayerModal from '@/app/dashboard/add-player-modal'
import AttachEmailForm from '@/app/dashboard/attach-email-form'

const TEAM = '00000000-0000-4000-8000-0000000000aa'
const PLAYER = '00000000-0000-4000-8000-0000000000bb'

function Shot() {
  const shot = useSearchParams().get('shot') ?? 'add'
  return (
    <main className="min-h-screen bg-[#F4F7FB] px-4 py-6">
      {shot === 'add' && (
        <section data-shot="add">
          <h1 className="text-sm text-[#456080] mb-3">Add roster player</h1>
          <AddPlayerModal teamId={TEAM} />
        </section>
      )}
      {shot === 'attach' && (
        <section data-shot="attach" className="bg-white rounded-xl border border-[#DDE4ED] p-4 max-w-md">
          <h1 className="text-sm text-[#456080] mb-3">Attach email later</h1>
          <AttachEmailForm playerId={PLAYER} currentEmail={null} />
        </section>
      )}
      {shot === 'attach-linked' && (
        <section data-shot="attach-linked" className="bg-white rounded-xl border border-[#DDE4ED] p-4 max-w-md">
          <h1 className="text-sm text-[#456080] mb-3">Email already on the player</h1>
          <AttachEmailForm playerId={PLAYER} currentEmail="player@email.com" />
        </section>
      )}
    </main>
  )
}

export default function RosterShotPage() {
  return (
    <Suspense>
      <Shot />
    </Suspense>
  )
}
