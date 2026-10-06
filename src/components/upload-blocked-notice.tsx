import { uploadBlockedCopy, type PendingReason, type UploadBlockedViewer } from '@/lib/consent'

// Visible explanation shown in place of upload / record controls when a
// player's age isn't confirmed yet, or they are under 13 (RP-041, 037).
// Information only: no buttons. The player confirms their age once when they
// join; the coach can also set it in Edit Player.
export default function UploadBlockedNotice({
  viewer = 'coach',
  reason,
  className = '',
  testId = 'upload-blocked-notice',
}: {
  viewer?: UploadBlockedViewer
  /** From pendingReason(player); defaults to 'age_band'. */
  reason?: PendingReason
  className?: string
  testId?: string
}) {
  const { message, nextStep } = uploadBlockedCopy(viewer, { reason })
  return (
    <div
      role="status"
      data-testid={testId}
      className={`rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-left ${className}`}
    >
      <p className="text-xs font-medium text-amber-900">{message}</p>
      <p className="text-xs text-amber-800 mt-0.5">{nextStep}</p>
    </div>
  )
}
