import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { useStore } from '../lib/store'
import { CATEGORY_META, type Category } from '../lib/types'
import { CATEGORY_ICON, BackIcon, NOTE_STICKER_ICON, ShuffleIcon } from '../components/Icons'
import { sendOneToOnePrompt, searchAccounts, type PublicProfile } from '../lib/realAccountsApi'
import { SentFlyAway } from '../components/SentFlyAway'
import {
  NOTE_COLORS,
  NOTE_COLOR_HEX,
  NOTE_COLOR_LABEL,
  NOTE_STICKERS,
  NOTE_HANDWRITING_STYLES,
  NOTE_HANDWRITING_FONT,
  NOTE_HANDWRITING_LABEL,
  type NoteColor,
  type NoteSticker,
  type NoteHandwriting,
} from '../lib/noteStyle'
import { getSuggestion, SUGGESTION_PACKS, SUGGESTION_PACK_LABEL, type SuggestionPack, type Suggestion } from '../lib/suggestionsApi'

export function RealSend() {
  const account = useStore((s) => s.account)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [recipientUsername, setRecipientUsername] = useState(() => searchParams.get('to') ?? '')
  const [category, setCategory] = useState<Category>('snap')
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  // Phase 9.1 — collapsed by default so styling never slows down the
  // common case of just sending a plain prompt. Default color stays the
  // original yellow; sticker and handwriting are opt-in and unset (plain
  // look) until the sender actually picks one.
  const [stylingOpen, setStylingOpen] = useState(false)
  const [noteColor, setNoteColor] = useState<NoteColor>('butter')
  const [noteSticker, setNoteSticker] = useState<NoteSticker | undefined>(undefined)
  const [noteHandwriting, setNoteHandwriting] = useState<NoteHandwriting | undefined>(undefined)

  // Phase 10 — "Need an idea?" generator. ideaSeenIds is session-only (a
  // plain in-memory array, not persisted) so a fresh visit to this screen
  // can see the same suggestion again; it only ever grows within one visit
  // here, which is what "already seen in the current session" means.
  const [ideaPack, setIdeaPack] = useState<SuggestionPack>('chill')
  const [idea, setIdea] = useState<Suggestion | undefined>(undefined)
  const [ideaLoading, setIdeaLoading] = useState(false)
  const [ideaSeenIds, setIdeaSeenIds] = useState<string[]>([])

  async function shuffleIdea(pack: SuggestionPack) {
    if (!account) return
    setIdeaLoading(true)
    try {
      const next = await getSuggestion(category, pack, ideaSeenIds, account.token)
      if (next) {
        setIdea(next)
        setIdeaSeenIds((prev) => [...prev, next.id])
      }
    } finally {
      setIdeaLoading(false)
    }
  }

  // Live suggestions as you type, same debounced search Feed.tsx uses —
  // picking one fills in the exact username so you never have to remember
  // or type someone's handle correctly by hand.
  const [suggestions, setSuggestions] = useState<PublicProfile[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const q = recipientUsername.trim().toLowerCase()

  useEffect(() => {
    if (q.length < 2) {
      setSuggestions([])
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      searchAccounts(q, account?.token).then((res) => {
        if (!cancelled) setSuggestions(res.ok ? res.data : [])
      })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [q, account?.token])

  if (!account) {
    return (
      <div className="p-6 text-center text-sm text-ink-soft">
        <p>You need an account to send a prompt this way.</p>
        <Link to="/signup" className="mt-2 inline-block underline">
          Create one
        </Link>
      </div>
    )
  }

  async function handleSend() {
    setErrors({})
    setSubmitting(true)
    try {
      const res = await sendOneToOnePrompt(
        {
          recipientUsername: recipientUsername.trim(),
          category,
          text: text.trim(),
          // Only sent when styling was actually opened — otherwise the
          // note is unstyled (matches the default look) rather than
          // explicitly "butter", so a user who never touches styling
          // behaves identically to one sent before this feature existed.
          ...(stylingOpen ? { noteColor, noteSticker, noteHandwriting } : {}),
        },
        account!.token,
      )
      if (!res.ok) {
        setErrors(res.errors)
        return
      }
      setSent(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <Link to="/profile" className="-mb-2 flex items-center gap-1 text-xs text-ink-faint">
        <BackIcon size={13} /> Back to profile
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl">Send a prompt</h1>
          <p className="text-xs text-ink-faint">Goes straight to their inbox, enforced the same way on the server.</p>
        </div>
        <Link to="/real/send/group" className="shrink-0 whitespace-nowrap text-xs text-ink-faint underline underline-offset-2">
          Send to a group
        </Link>
      </div>

      <label className="relative flex flex-col gap-1.5 text-xs uppercase tracking-wider text-ink-faint">
        To (username)
        <input
          value={recipientUsername}
          onChange={(e) => {
            setRecipientUsername(e.target.value)
            setErrors((p) => ({ ...p, recipientUsername: '' }))
            setShowSuggestions(true)
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder="bob"
          className={clsx(
            'rounded-sm border bg-card p-2.5 text-base normal-case tracking-normal outline-none',
            errors.recipientUsername ? 'border-danger' : 'border-line focus:border-line-strong',
          )}
        />
        {errors.recipientUsername && <span className="text-danger normal-case tracking-normal">{errors.recipientUsername}</span>}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 flex flex-col overflow-hidden rounded-sm border border-line bg-card shadow-note">
            {suggestions.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setRecipientUsername(p.username)
                  setShowSuggestions(false)
                  setErrors((prev) => ({ ...prev, recipientUsername: '' }))
                }}
                className="flex items-center gap-2.5 px-3 py-2 text-left normal-case tracking-normal hover:bg-paper-dim"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-paper-dim font-serif text-xs">
                  {p.displayName.charAt(0).toUpperCase()}
                </span>
                <span>
                  <span className="block text-sm font-medium leading-tight">{p.displayName}</span>
                  <span className="block text-xs text-ink-faint">@{p.username}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </label>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-ink-faint">Category</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CATEGORY_META) as Category[]).map((c) => (
            <button
              key={c}
              onClick={() => {
                setCategory(c)
                setIdea(undefined)
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
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => shuffleIdea(ideaPack)}
            disabled={ideaLoading}
            className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-ink-soft disabled:opacity-60"
          >
            <ShuffleIcon size={13} />
            {idea ? 'Shuffle' : 'Need an idea?'}
          </button>
          {SUGGESTION_PACKS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setIdeaPack(p)
                if (idea) shuffleIdea(p)
              }}
              className={clsx(
                'rounded-full border px-2.5 py-1 text-[11px]',
                ideaPack === p ? 'border-ink bg-ink text-paper' : 'border-line text-ink-faint',
              )}
            >
              {SUGGESTION_PACK_LABEL[p]}
            </button>
          ))}
        </div>
        {idea && (
          <button
            type="button"
            onClick={() => {
              setText(idea.text)
              setIdea(undefined)
            }}
            className="rounded-sm border border-dashed border-line bg-paper-dim p-2.5 text-left text-sm italic text-ink-soft"
          >
            {idea.text}
            <span className="mt-1 block text-[10px] not-italic uppercase tracking-wide text-ink-faint">Tap to use this</span>
          </button>
        )}
      </div>

      <label className="flex flex-col gap-1.5 text-xs uppercase tracking-wider text-ink-faint">
        Prompt text
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setErrors((p) => ({ ...p, text: '' }))
          }}
          rows={2}
          placeholder="take a picture of a flower and post it"
          className={clsx(
            'resize-none rounded-sm border bg-card p-2.5 text-base normal-case tracking-normal outline-none',
            errors.text ? 'border-danger' : 'border-line focus:border-line-strong',
          )}
        />
        {errors.text && <span className="text-danger normal-case tracking-normal">{errors.text}</span>}
      </label>

      {!stylingOpen ? (
        <button
          onClick={() => setStylingOpen(true)}
          className="self-start text-xs text-ink-faint underline underline-offset-2"
        >
          Style your note
        </button>
      ) : (
        <div className="rounded-sm border border-line bg-card p-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-ink-faint">Style your note</p>
            <button onClick={() => setStylingOpen(false)} className="text-xs text-ink-faint underline underline-offset-2">
              Hide
            </button>
          </div>

          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-ink-faint">Color</p>
          <div className="mb-3 flex gap-2">
            {NOTE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={NOTE_COLOR_LABEL[c]}
                onClick={() => setNoteColor(c)}
                style={{ backgroundColor: NOTE_COLOR_HEX[c] }}
                className={clsx(
                  'h-8 w-8 rounded-full border-2 transition',
                  noteColor === c ? 'border-ink' : 'border-line',
                )}
              />
            ))}
          </div>

          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-ink-faint">Sticker (optional)</p>
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => setNoteSticker(undefined)}
              className={clsx(
                'flex h-8 w-8 items-center justify-center rounded-full border text-[10px] text-ink-faint',
                !noteSticker ? 'border-ink' : 'border-line',
              )}
            >
              None
            </button>
            {NOTE_STICKERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setNoteSticker(s)}
                className={clsx(
                  'flex h-8 w-8 items-center justify-center rounded-full border text-ink-soft',
                  noteSticker === s ? 'border-ink' : 'border-line',
                )}
              >
                <NOTE_STICKER_ICON sticker={s} size={14} />
              </button>
            ))}
          </div>

          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-ink-faint">Handwriting</p>
          <div className="mb-4 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setNoteHandwriting(undefined)}
              className={clsx(
                'rounded-full border px-2.5 py-1 text-xs',
                !noteHandwriting ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft',
              )}
            >
              Default
            </button>
            {NOTE_HANDWRITING_STYLES.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setNoteHandwriting(h)}
                style={{ fontFamily: NOTE_HANDWRITING_FONT[h] }}
                className={clsx(
                  'rounded-full border px-2.5 py-1 text-xs',
                  noteHandwriting === h ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft',
                )}
              >
                {NOTE_HANDWRITING_LABEL[h]}
              </button>
            ))}
          </div>

          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-ink-faint">Preview</p>
          <div
            style={{ backgroundColor: NOTE_COLOR_HEX[noteColor] }}
            className="relative w-40 rounded-sm border border-line p-3 shadow-note"
          >
            {noteSticker && (
              <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-paper text-ink-soft">
                <NOTE_STICKER_ICON sticker={noteSticker} size={12} />
              </span>
            )}
            <p
              className="line-clamp-3 font-serif text-sm text-ink"
              style={{ fontFamily: noteHandwriting ? NOTE_HANDWRITING_FONT[noteHandwriting] : undefined }}
            >
              {text.trim() || 'Your prompt will look like this.'}
            </p>
          </div>
        </div>
      )}

      {errors.form && <p className="text-sm text-danger">{errors.form}</p>}

      <button
        onClick={handleSend}
        disabled={!recipientUsername.trim() || !text.trim() || submitting || sent}
        className="rounded-sm bg-ink py-3 text-sm font-medium text-paper disabled:bg-line disabled:text-ink-faint"
      >
        {sent ? 'Sent!' : submitting ? 'Sending…' : 'Send prompt'}
      </button>

      {sent && (
        <SentFlyAway
          onComplete={() => navigate('/')}
          noteColor={stylingOpen ? noteColor : undefined}
          noteSticker={stylingOpen ? noteSticker : undefined}
          noteHandwriting={stylingOpen ? noteHandwriting : undefined}
        />
      )}
    </div>
  )
}
