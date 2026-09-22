import { Link } from 'react-router-dom'

export function Privacy() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-6 text-sm leading-relaxed text-ink-soft">
      <Link to="/" className="text-xs text-ink-faint underline">
        Back
      </Link>
      <h1 className="font-serif text-2xl text-ink">Privacy Policy</h1>
      <p className="text-xs text-ink-faint">Last updated: beta release. This is a beta product — this policy will evolve.</p>

      <h2 className="mt-2 font-serif text-lg text-ink">What we collect</h2>
      <p>
        Your username, email, and password (stored as a salted hash, never in plain text). The prompts, photos,
        videos, captions, boards, and calendars you create. Who you follow and who follows you. If you enable
        push notifications, the subscription details your browser gives us to deliver them.
      </p>

      <h2 className="mt-2 font-serif text-lg text-ink">How we use it</h2>
      <p>
        To run the app: showing your feed, delivering prompts, notifying you of activity, and enforcing who can
        send you a prompt based on your own settings. We don't sell your data or share it with advertisers.
      </p>

      <h2 className="mt-2 font-serif text-lg text-ink">Who can see what</h2>
      <p>
        A 1:1 prompt and its completion are visible to you and the other person. A board challenge you complete
        is visible to that board's subscribers. Anything you tag into a public calendar is visible to anyone.
        Your profile is visible to anyone who looks it up, showing only what you've chosen to add.
      </p>

      <h2 className="mt-2 font-serif text-lg text-ink">Your choices</h2>
      <p>
        You can block another account at any time, which also removes any follow relationship between you. You
        can delete your account from your profile settings — this removes your personal details and prevents
        login, though prompts and completions you were part of stay visible to the other people they involved
        (shown as attributed to a deleted account) rather than disappearing from their history.
      </p>

      <h2 className="mt-2 font-serif text-lg text-ink">Data retention and security</h2>
      <p>
        Photos and videos you upload are stored on our server, not a third-party host. Passwords are hashed with
        a per-account salt and never stored or logged in plain text. As a beta product, we can't yet promise the
        long-term data guarantees of a mature service — export or back up anything irreplaceable yourself.
      </p>

      <p className="mt-4 text-xs text-ink-faint">
        See also our{' '}
        <Link to="/terms" className="underline">
          Terms of Service
        </Link>
        .
      </p>
    </div>
  )
}
