/**
 * src/services/api.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralized API client for the AlphaAssist backend.
 *
 * Every request automatically:
 *  1. Reads the active Supabase session
 *  2. Attaches the JWT as Authorization: Bearer <token>
 *  3. Points to EXPO_PUBLIC_BACKEND_URL
 *
 * Usage:
 *   import { apiPost, apiGet } from '../services/api'
 *   const data = await apiPost('/api/chat', { message: 'hello' })
 */

import { supabase } from './supabase'
import { Platform } from 'react-native'

// ── Base URL ─────────────────────────────────────────────────────────────────
// Set EXPO_PUBLIC_BACKEND_URL in your .env (e.g. http://192.168.1.x:8000)
// Falls back to platform-specific localhost for development convenience.
const BASE_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  Platform.select({
    ios:     'http://localhost:8000',
    android: 'http://10.0.2.2:8000',
    default: 'http://localhost:8000',
  })

export { BASE_URL }

// ── Auth header helper ────────────────────────────────────────────────────────

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Not authenticated — please log in.')
  }
  return { Authorization: `Bearer ${session.access_token}` }
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────

async function apiFetch(
  path: string,
  options: RequestInit = {},
  isFormData = false,
): Promise<Response> {
  const authHeader = await getAuthHeader()

  const headers: Record<string, string> = {
    ...authHeader,
    ...(options.headers as Record<string, string> || {}),
  }

  // Only set Content-Type for JSON requests (FormData sets its own boundary)
  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  })

  return response
}

// ── Typed helpers ─────────────────────────────────────────────────────────────

/**
 * GET request — returns parsed JSON or throws on error.
 */
export async function apiGet<T = any>(path: string): Promise<T> {
  const resp = await apiFetch(path, { method: 'GET' })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }))
    throw new Error(err.detail || `GET ${path} failed (${resp.status})`)
  }
  return resp.json()
}

/**
 * POST request with JSON body — returns parsed JSON or throws on error.
 */
export async function apiPost<T = any>(path: string, body: object): Promise<T> {
  const resp = await apiFetch(path, {
    method: 'POST',
    body:   JSON.stringify(body),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }))
    throw new Error(err.detail || `POST ${path} failed (${resp.status})`)
  }
  return resp.json()
}

/**
 * POST request with FormData body (multipart) — returns parsed JSON or throws.
 */
export async function apiPostForm<T = any>(path: string, formData: FormData): Promise<T> {
  const resp = await apiFetch(
    path,
    { method: 'POST', body: formData },
    true, // isFormData — skip Content-Type override
  )
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }))
    throw new Error(err.detail || `POST ${path} failed (${resp.status})`)
  }
  return resp.json()
}

/**
 * POST request that returns the raw Response for SSE streaming.
 */
export async function apiStream(path: string, body: object): Promise<Response> {
  const resp = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }))
    throw new Error(err.detail || `Stream ${path} failed (${resp.status})`)
  }
  return resp
}

/**
 * PATCH request with JSON body.
 */
export async function apiPatch<T = any>(path: string, body: object): Promise<T> {
  const resp = await apiFetch(path, {
    method: 'PATCH',
    body:   JSON.stringify(body),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }))
    throw new Error(err.detail || `PATCH ${path} failed (${resp.status})`)
  }
  return resp.json()
}

/**
 * DELETE request.
 */
export async function apiDelete(path: string): Promise<void> {
  const resp = await apiFetch(path, { method: 'DELETE' })
  if (!resp.ok && resp.status !== 204) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }))
    throw new Error(err.detail || `DELETE ${path} failed (${resp.status})`)
  }
}
