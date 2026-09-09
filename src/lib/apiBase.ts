// In local dev, API calls hit relative /api/... paths and Vite's dev-server
// proxy (vite.config.ts) forwards them to the backend on :8787 — same
// origin, no CORS involved. That proxy doesn't exist in a production
// static build (e.g. deployed to Vercel), so once the frontend and backend
// are on different hosts, set VITE_API_BASE_URL at build time to the
// backend's public URL and every call below is prefixed with it instead.
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}
