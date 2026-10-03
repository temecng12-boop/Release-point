import type { ReactNode } from 'react'
import { uploadBlockedCopy, type GuardianNotice, type PendingReason, type UploadBlockedViewer } from '@/lib/consent'

// Visible explanation shown in place of upload / record controls when a
// player's age isn't confirmed, or an under-13 player has no guardian consent
// on record (RP-041). Also used as the dashboard banner (testId).
export default function UploadBlockedNotice({
  viewer = 'coach',
  action,
  selfConfirm = false,
  reason,
  guardian,
  className = '',
  testId = 'upload-blocked-notice',
}: {
  viewer?: UploadBlockedViewer
  action?: ReactNode
  /** The player confirms their age themself (no coach); `action` holds the picker. */
  selfConfirm?: boolean
  /** From pendingReason(player); defaults to 'age_band'. */
  reason?: PendingReason
  /** Under-13 player's own view: guardian on file / emailed. */
  guardian?: GuardianNotice | null
  className?: string
  testId?: string
}) {
  const { message, nextStep } = uploadBlockedCopy(viewer, { reason, guardian, selfConfirm, confirmShownBelow: selfConfirm && !!action })
  return (
    <div
      role="status"
      data-testid={testId}
      className={`rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-left ${className}`}
    >
      <p className="text-xs font-medium text-amber-900">{message}</p>
      <p className="text-xs text-amber-800 mt-0.5">{nextStep}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
