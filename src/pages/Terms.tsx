import { Link } from 'react-router-dom'

export function Terms() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-6 text-sm leading-relaxed text-ink-soft">
      <Link to="/" className="text-xs text-ink-faint underline">
        Back
      </Link>
      <h1 className="font-serif text-2xl text-ink">Terms of Service</h1>
      <p className="text-xs text-ink-faint">Last updated: beta release. This is a beta product — these terms will evolve.</p>

      <p>
        Prompt is a small, early beta. By creating an account you agree to use it in good faith and understand
        that features, data, and availability may change without notice while it's in this stage.
      </p>

      <h2 className="mt-2 font-serif text-lg text-ink">Your account</h2>
      <p>
        You're responsible for what you post and for keeping your password to yourself. You must be at least 13
        years old to use Prompt. Don't impersonate anyone, harass other users, or post content that's illegal,
        abusive, or infringes someone else's rights.
      </p>

      <h2 className="mt-2 font-serif text-lg text-ink">Content you post</h2>
      <p>
        You keep ownership of the photos, videos, and text you post. By posting, you give Prompt permission to
        store and display that content to the other users it's meant for (whoever you sent it to, your followers,
        or the public, depending on where you posted it).
      </p>

      <h2 className="mt-2 font-serif text-lg text-ink">Blocking, reporting, and enforcement</h2>
      <p>
        You can block or report another account or piece of content at any time. We may remove content, suspend,
        or delete accounts that violate these terms or make the app unsafe for others.
      </p>

      <h2 className="mt-2 font-serif text-lg text-ink">No warranty</h2>
      <p>
        This is beta software provided as-is, without warranty of any kind. We'll do our best to keep your data
        safe and the app running, but we can't guarantee uninterrupted availability during this stage.
      </p>

      <h2 className="mt-2 font-serif text-lg text-ink">Changes</h2>
      <p>We may update these terms as the product develops. Continuing to use Prompt after a change means you accept the update.</p>

      <p className="mt-4 text-xs text-ink-faint">
        See also our{' '}
        <Link to="/privacy" className="underline">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  )
}
