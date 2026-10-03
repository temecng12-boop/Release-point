// Wording for the team delete dialog and its errors (QA-015), shared by the
// server action and the dialog. Counts come from migration 030.

const players = (n: number) => (n === 1 ? '1 player' : `${n} players`)

/** Players some coach sees only through this team. */
export function losingAccessLine(n: number): string {
  if (n === 0) return 'Every player on this team stays visible to their coaches.'
  return `${players(n)} will no longer appear for coaches who only see them through this team.`
}

/** Players with no coach of their own whose only team is this one. */
export function blockedLine(n: number): string {
  return `${players(n)} on this team ${n === 1 ? 'has' : 'have'} no coach of their own and no other team. ` +
    'Deleting the team would leave them with no coach, so it can\'t be deleted until they have a coach or another team.'
}
