import { db } from './db.js'

export interface CommentRow {
  id: string
  completion_id: string
  account_id: string
  text: string
  is_removed: number
  removed_by: string | null
  created_at: number
}

const insertComment = db.prepare(`
  INSERT INTO completion_comments (id, completion_id, account_id, text, created_at)
  VALUES (@id, @completionId, @accountId, @text, @createdAt)
`)

const listForCompletionStmt = db.prepare(`
  SELECT cc.id, cc.completion_id, cc.account_id, cc.text, cc.created_at,
         a.username, a.first_name, a.organization_name, a.avatar_path
  FROM completion_comments cc
  JOIN accounts a ON a.id = cc.account_id
  WHERE cc.completion_id = ? AND cc.is_removed = 0
  ORDER BY cc.created_at ASC
`)

const getByIdStmt = db.prepare('SELECT * FROM completion_comments WHERE id = ?')
const removeStmt = db.prepare('UPDATE completion_comments SET is_removed = 1, removed_by = ? WHERE id = ?')

export function addComment(input: { id: string; completionId: string; accountId: string; text: string; createdAt: number }): void {
  insertComment.run(input)
}

export interface CommentView {
  id: string
  completionId: string
  text: string
  createdAt: number
  authorUsername: string
  authorDisplayName: string
  authorAvatarUrl?: string
  isMine: boolean
}

interface CommentJoinRow {
  id: string
  completion_id: string
  account_id: string
  text: string
  created_at: number
  username: string
  first_name: string | null
  organization_name: string | null
  avatar_path: string | null
}

export function listComments(completionId: string, viewerId?: string): CommentView[] {
  return (listForCompletionStmt.all(completionId) as CommentJoinRow[]).map((r) => ({
    id: r.id,
    completionId: r.completion_id,
    text: r.text,
    createdAt: r.created_at,
    authorUsername: r.username,
    authorDisplayName: r.first_name ?? r.organization_name ?? r.username,
    authorAvatarUrl: r.avatar_path ?? undefined,
    isMine: viewerId === r.account_id,
  }))
}

export function getCommentById(id: string): CommentRow | undefined {
  return getByIdStmt.get(id) as CommentRow | undefined
}

// removedBy: the admin account id when an admin moderated it away, or
// undefined for the author deleting their own — kept distinct so an
// admin's dashboard can tell the two apart later.
export function removeComment(id: string, removedBy?: string): void {
  removeStmt.run(removedBy ?? null, id)
}
