import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useStore } from '../lib/store'
import { PromptLogo, PromptMark } from '../components/PromptLogo'

export function InviteLanding() {
  const loggedIn = useStore((s) => s.loggedIn)

  return (
    <div className="flex min-h-screen min-h-dvh flex-col items-center justify-center bg-paper p-6 paper-grain">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.65, 0, 0.35, 1] }}
        className="flex w-full max-w-sm flex-col items-center gap-7 rounded-md border border-line bg-card px-8 py-12 text-center shadow-note"
      >
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
        >
          <PromptMark size={56} />
        </motion.div>

        <div>
          <PromptLogo size={52} className="justify-center" />
          <div className="mx-auto mt-3 h-[3px] w-16 rounded-full bg-accent" />
          <p className="mt-4 font-serif text-2xl italic text-ink-soft">prompt your life</p>
        </div>

        <p className="text-sm leading-relaxed text-ink-soft">
          A little push, every day. Send a prompt, get a prompt, and watch your calendar fill up with the things you'd
          never have gotten around to otherwise.
        </p>

        {loggedIn ? (
          <Link
            to="/"
            className="w-full rounded-sm border border-ink bg-ink py-3 text-sm font-medium text-paper transition hover:bg-ink-soft"
          >
            Continue to your calendar
          </Link>
        ) : (
          <div className="flex w-full flex-col gap-2.5">
            <Link
              to="/signup"
              className="w-full rounded-sm border border-ink bg-ink py-3 text-sm font-medium text-paper transition hover:bg-ink-soft"
            >
              Create your account
            </Link>
            <Link
              to="/login"
              className="w-full rounded-sm border border-line py-3 text-sm text-ink-soft transition hover:border-line-strong"
            >
              I already have an account
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  )
}
