import {decode, newId, type Document} from './model'
export const draftKey = 'textlab:draft:v1'
const keepPrefix = 'textlab:keep:v1:'
export type Saved = {key: string; doc: Document}
export function readDraft(fallback: Document) {
  try {
    const raw = localStorage.getItem(draftKey)
    return {doc: raw ? decode(JSON.parse(raw)) : fallback, damaged: false}
  } catch {
    return {doc: fallback, damaged: true}
  }
}
export function readCollection(): Saved[] {
  const entries: Saved[] = []
  try {
    for (const key of Object.keys(localStorage).filter(key => key.startsWith(keepPrefix))) {
      try { entries.push({key, doc: decode(JSON.parse(localStorage.getItem(key) ?? 'null'))}) }
      catch { continue }
    }
  } catch { return entries }
  return entries
}
export function keep(doc: Document): Saved {
  const key = keepPrefix + newId()
  localStorage.setItem(key, JSON.stringify(doc))
  return {key, doc}
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.download = name
  anchor.href = url
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
