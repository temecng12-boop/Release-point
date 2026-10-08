'use client'

import AddPlayerModal from '@/app/dashboard/add-player-modal'

export default function TeamInviteForm({ teamId }: { teamId: string }) {
  return <AddPlayerModal teamId={teamId} />
}
