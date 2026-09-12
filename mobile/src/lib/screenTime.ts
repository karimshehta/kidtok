export function getChildSessionEndStorageKey(childId: string) {
  return `kid-session-end:${childId}`
}

export type ChildSessionTimer = {
  endTs: number
  limitSec: number | null
}

export function serializeChildSessionTimer(endTs: number, limitSec: number) {
  return JSON.stringify({ endTs, limitSec })
}

export function parseChildSessionTimer(value: string | null): ChildSessionTimer | null {
  if (!value) return null

  try {
    const parsed = JSON.parse(value)
    const endTs = Number(parsed?.endTs)
    const limitSec = Number(parsed?.limitSec)
    if (Number.isFinite(endTs) && endTs > 0) {
      return {
        endTs,
        limitSec: Number.isFinite(limitSec) && limitSec > 0 ? limitSec : null,
      }
    }
  } catch {}

  const legacyEndTs = parseInt(value, 10)
  if (!Number.isNaN(legacyEndTs) && legacyEndTs > 0) {
    return { endTs: legacyEndTs, limitSec: null }
  }

  return null
}

export function getLegacyChildSessionEndStorageKey(childId: string) {
  const today = new Date().toISOString().slice(0, 10)
  return `kid-end:${childId}:${today}`
}

export function createChildSessionEndTimestamp(minutes: number) {
  return Date.now() + minutes * 60 * 1000
}
