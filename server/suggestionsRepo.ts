import crypto from 'node:crypto'
import { db } from './db.js'

export interface SuggestionRow {
  id: string
  category: string
  pack: string
  text: string
  enabled: number
  createdAt: number
}

// Picks one random enabled suggestion for a category/pack, skipping any id
// the caller has already seen this session (sent as a comma-separated list
// from the client, which only ever tracks ids for its own current session
// in memory). Falls back to the full pool for that category/pack once
// everything has been seen, so a short pool never dead-ends the shuffle
// button.
const randomForCombo = db.prepare(
  `SELECT id, category, pack, text FROM prompt_suggestions WHERE category = ? AND pack = ? AND enabled = 1 ORDER BY RANDOM() LIMIT 1`,
)
const randomForComboExcluding = (excludeCount: number) =>
  db.prepare(
    `SELECT id, category, pack, text FROM prompt_suggestions WHERE category = ? AND pack = ? AND enabled = 1 AND id NOT IN (${Array(excludeCount).fill('?').join(',')}) ORDER BY RANDOM() LIMIT 1`,
  )

export function getRandomSuggestion(
  category: string,
  pack: string,
  excludeIds: string[],
): { id: string; category: string; pack: string; text: string } | undefined {
  if (excludeIds.length > 0) {
    const row = randomForComboExcluding(excludeIds.length).get(category, pack, ...excludeIds) as
      | { id: string; category: string; pack: string; text: string }
      | undefined
    if (row) return row
  }
  // Nothing left unseen (or no exclusions given) — fall back to the whole pool.
  return randomForCombo.get(category, pack) as { id: string; category: string; pack: string; text: string } | undefined
}

// --- Admin -------------------------------------------------------------

const listStmt = db.prepare(
  `SELECT id, category, pack, text, enabled, created_at AS createdAt FROM prompt_suggestions ORDER BY created_at DESC LIMIT ? OFFSET ?`,
)
export function adminListSuggestions(limit: number, offset: number): SuggestionRow[] {
  return listStmt.all(limit, offset) as SuggestionRow[]
}

const getStmt = db.prepare(`SELECT id, category, pack, text, enabled, created_at AS createdAt FROM prompt_suggestions WHERE id = ?`)
export function adminGetSuggestion(id: string): SuggestionRow | undefined {
  return getStmt.get(id) as SuggestionRow | undefined
}

const insertStmt = db.prepare(
  `INSERT INTO prompt_suggestions (id, category, pack, text, enabled, created_at) VALUES (?, ?, ?, ?, 1, ?)`,
)
export function adminCreateSuggestion(category: string, pack: string, text: string): SuggestionRow {
  const id = crypto.randomUUID()
  const createdAt = Date.now()
  insertStmt.run(id, category, pack, text, createdAt)
  return { id, category, pack, text, enabled: 1, createdAt }
}

const updateStmt = db.prepare(`UPDATE prompt_suggestions SET category = ?, pack = ?, text = ? WHERE id = ?`)
export function adminUpdateSuggestion(id: string, category: string, pack: string, text: string): void {
  updateStmt.run(category, pack, text, id)
}

const setEnabledStmt = db.prepare(`UPDATE prompt_suggestions SET enabled = ? WHERE id = ?`)
export function adminSetSuggestionEnabled(id: string, enabled: boolean): void {
  setEnabledStmt.run(enabled ? 1 : 0, id)
}
