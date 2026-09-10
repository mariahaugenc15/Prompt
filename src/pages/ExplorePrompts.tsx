import { ExploreChallengesList } from '../components/ExploreChallengesList'

export function ExplorePrompts() {
  return (
    <div className="flex flex-col gap-5 p-4">
      <div>
        <h1 className="font-serif text-2xl">Explore prompts</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Challenges from public boards, made by other people on Prompt. Pick one up and it lands on today's calendar.
        </p>
      </div>
      <ExploreChallengesList />
    </div>
  )
}
