import { registerDailyJob } from './scheduler.js'
import { listDueChallengeIds, getChallengeById, endChallenge } from './teamChallengeRepo.js'

// Deadline half of ending a challenge — the lazy ensureChallengeEnded
// check in teamChallengeRoutes.ts covers the "someone looked at it after
// the period ended" case immediately; this covers a challenge nobody
// happens to view right after its period ends.
export function registerTeamChallengeSweep(): void {
  registerDailyJob('team_challenge_sweep', 10, 15, () => {
    for (const id of listDueChallengeIds()) {
      const challenge = getChallengeById(id)
      if (challenge) endChallenge(challenge)
    }
  })
}
