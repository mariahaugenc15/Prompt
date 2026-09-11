// Client for real comments on a completion (server/commentsRoutes.ts).

import { apiUrl } from './apiBase'

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

type ApiResult<T> = { ok: true; data: T } | { ok: false; errors: Record<string, string> }

async function call<T>(path: string, token: string | undefined, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  const body = await res.json().catch(() => ({}))
  if (res.ok) return { ok: true, data: body as T }
  return { ok: false, errors: body.errors ?? { form: 'Something went wrong. Please try again.' } }
}

export function getComments(completionId: string, token?: string) {
  return call<CommentView[]>(`/api/completions/${encodeURIComponent(completionId)}/comments`, token)
}

export function postComment(completionId: string, text: string, token: string) {
  return call<CommentView>(`/api/completions/${encodeURIComponent(completionId)}/comments`, token, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

export function deleteComment(commentId: string, token: string) {
  return call<{ id: string }>(`/api/comments/${encodeURIComponent(commentId)}`, token, { method: 'DELETE' })
}
