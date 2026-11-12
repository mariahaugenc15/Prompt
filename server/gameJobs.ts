import { registerDailyJob } from './scheduler.js'
import { listEnabledGameBoardIds, runDailyGameCheck } from './gameRepo.js'

// Once a day: for every board with its game enabled, this both rolls over
// a week whose end has passed (ensureCurrentWeek, called from inside
// runDailyGameCheck) and runs the "you were passed" rank check. A board
// in a timezone where this lands mid-afternoon rather than at midnight is
// fine — the rollover itself is keyed off the week's own stored
// week_end, not off when this job happens to run, so a week only ever
// ends once its actual boundary has passed, whichever tick notices first.
export function registerGameDailyJob(): void {
  registerDailyJob('game_daily_check', 10, 0, () => {
    for (const boardId of listEnabledGameBoardIds()) runDailyGameCheck(boardId)
  })
}
