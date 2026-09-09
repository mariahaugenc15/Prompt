import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useStore } from '../lib/store'
import type { Category } from '../lib/types'
import { CATEGORY_META } from '../lib/types'
import { CATEGORY_ICON, LockIcon, PinIcon } from '../components/Icons'
import clsx from 'clsx'

export function SendPrompt() {
  const navigate = useNavigate()
  const users = useStore((s) => s.users)
  const following = useStore((s) => s.following)
  const library = useStore((s) => s.challengeLibrary)
  const sendPrompt = useStore((s) => s.sendPrompt)

  const [toUserId, setToUserId] = useState<string | null>(null)
  const [category, setCategory] = useState<Category>('snap')
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [customText, setCustomText] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [pinning, setPinning] = useState(false)

  const friends = users.filter((u) => following.includes(u.id))
  const templatesForCategory = library.filter((t) => t.category === category)
  const text = templateId ? library.find((t) => t.id === templateId)?.text ?? '' : customText

  const canSend = Boolean(toUserId) && text.trim().length > 0

  function handleSend() {
    if (!toUserId || !canSend) return
    setPinning(true)
    setTimeout(() => {
      sendPrompt(toUserId, { text: text.trim(), category, anonymous })
      navigate('/')
    }, 550)
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <h1 className="font-serif text-2xl">Dare a friend</h1>

      <section>
        <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">To</p>
        <div className="flex flex-wrap gap-2">
          {friends.length === 0 && <p className="text-sm text-ink-faint">Follow someone first to send them a dare.</p>}
          {friends.map((u) => (
            <button
              key={u.id}
              onClick={() => setToUserId(u.id)}
              className={clsx(
                'rounded-full border px-3 py-1.5 text-sm transition',
                toUserId === u.id ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft',
              )}
            >
              {u.name}
            </button>
          ))}
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Category</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CATEGORY_META) as Category[]).map((c) => (
            <button
              key={c}
              onClick={() => {
                setCategory(c)
                setTemplateId(null)
              }}
              className={clsx(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition',
                category === c ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft',
              )}
            >
              <CATEGORY_ICON category={c} size={14} />
              {CATEGORY_META[c].label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Challenge</p>
        <div className="flex flex-col gap-1.5">
          {templatesForCategory.map((t) => (
            <button
              key={t.id}
              onClick={() => setTemplateId(t.id)}
              className={clsx(
                'rounded-sm border px-3 py-2 text-left text-sm transition',
                templateId === t.id ? 'border-ink bg-paper-dim' : 'border-line bg-card',
              )}
            >
              {t.text}
            </button>
          ))}
          <textarea
            value={customText}
            onChange={(e) => {
              setCustomText(e.target.value)
              setTemplateId(null)
            }}
            placeholder="Or write your own dare…"
            rows={2}
            className="resize-none rounded-sm border border-line bg-card p-2.5 text-sm outline-none focus:border-line-strong"
          />
        </div>
      </section>

      <section className="flex items-center justify-between rounded-sm border border-line bg-card px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm">
          <LockIcon size={15} className="text-ink-faint" />
          Send anonymously
        </div>
        <button
          onClick={() => setAnonymous(!anonymous)}
          className={clsx('h-6 w-11 rounded-full border transition', anonymous ? 'border-ink bg-ink' : 'border-line bg-paper-dim')}
        >
          <span
            className={clsx(
              'block h-4 w-4 rounded-full bg-paper transition-transform',
              anonymous ? 'translate-x-5' : 'translate-x-1',
            )}
          />
        </button>
      </section>

      <motion.button
        onClick={handleSend}
        disabled={!canSend || pinning}
        animate={pinning ? { scale: [1, 0.9, 1] } : {}}
        className="mt-2 flex items-center justify-center gap-2 rounded-sm bg-ink py-3 text-sm font-medium text-paper disabled:bg-line disabled:text-ink-faint"
      >
        <PinIcon size={15} /> {pinning ? 'Pinning to their fridge…' : 'Pin this dare'}
      </motion.button>
    </div>
  )
}
