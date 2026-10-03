import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { loadLessonFeedback } from '@/lib/lessons'
import LessonList from './lesson-list'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

function fmtDate(iso: string, dateOnly: boolean) {
  return new Date(iso + (dateOnly ? 'T12:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * "Coach's Lesson Feedback": every lesson for a player, grouped by clip.
 * Renders nothing unless the viewer can view the player (player, guardian,
 * direct coach or team coach).
 */
export default async function LessonFeedbackSection({ playerId, viewerId }: { playerId: string; viewerId: string }) {
  const data = await loadLessonFeedback(supabaseAdmin, viewerId, playerId)
  if (!data) return null
  const { groups, canManage } = data

  return (
    <section className="bg-white rounded-xl border border-[#DDE4ED] shadow-sm p-5">
      <p className="text-[10px] tracking-[0.3em] text-[#1C3A5C] mb-3" style={oswald}>Coach&apos;s Lesson Feedback</p>
      {groups.length === 0 ? (
        <p className="text-xs text-[#3D5166]">No lesson recordings yet.</p>
      ) : (
        <div className="space-y-4">
          {groups.map(g => (
            <div key={g.clip.id}>
              <Link href={`/clips/${g.clip.id}`} className="text-sm text-[#0F1F33] hover:text-[#C8102E] transition-colors">
                {g.clip.title ?? 'Clip'}
              </Link>
              <span className="text-xs text-[#8096AE] ml-2">
                {fmtDate(g.clip.session_date ?? g.clip.created_at, !!g.clip.session_date)} · {g.lessons.length} lesson{g.lessons.length !== 1 ? 's' : ''}
              </span>
              <LessonList lessons={g.lessons} canManage={canManage} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
