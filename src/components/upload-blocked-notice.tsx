import type { ReactNode } from 'react'
import { uploadBlockedCopy, type UploadBlockedViewer } from '@/lib/consent'

// Visible explanation shown in place of upload / record controls when a player
// has no 18+ confirmation and no guardian consent on record (RP-041).
export default function UploadBlockedNotice({
  viewer = 'coach',
  action,
  className = '',
}: {
  viewer?: UploadBlockedViewer
  action?: ReactNode
  className?: string
}) {
  const { message, nextStep } = uploadBlockedCopy(viewer)
  return (
    <div
      role="status"
      data-testid="upload-blocked-notice"
      className={`rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-left ${className}`}
    >
      <p className="text-xs font-medium text-amber-900">{message}</p>
      <p className="text-xs text-amber-800 mt-0.5">{nextStep}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
