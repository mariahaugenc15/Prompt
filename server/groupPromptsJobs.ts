import { db } from './db.js'
import { registerMinuteJob } from './scheduler.js'
import { revealGroup } from './groupPromptsRepo.js'

// The deadline half of "opens when every recipient has completed it, or
// when the deadline passes, whichever comes first" (12.4). Runs every
// minute rather than as a once-a-day job since a deadline can land at any
// time; revealGroup's own revealed_at IS NULL guard is what makes this
// safe to run repeatedly and to race against the same-moment
// everyone-just-finished path in maybeRevealIfGroupComplete.
const dueSealedGroupsStmt = db.prepare(
  `SELECT id FROM prompt_groups WHERE sealed = 1 AND revealed_at IS NULL AND cancelled_at IS NULL AND deadline_at IS NOT NULL AND deadline_at <= ?`,
)

export function registerSealedRevealSweep(): void {
  registerMinuteJob('sealed_reveal_sweep', () => {
    const due = dueSealedGroupsStmt.all(Date.now()) as { id: string }[]
    for (const { id } of due) revealGroup(id)
  })
}
