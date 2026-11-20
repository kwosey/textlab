import {useEffect, useRef, useState} from 'react'
import type {Document} from './model'
import type {VideoProgress} from './video-export'

type Status =
  | {phase: 'starting'}
  | {phase: 'encoding'; progress: VideoProgress}
  | {phase: 'cancelling'}
  | {phase: 'ready'; file: File; url: string}
  | {phase: 'message'; text: string}

export function useVideoExport() {
  const [status, setStatus] = useState<Status | null>(null)
  const controller = useRef<AbortController | null>(null)
  const resultUrl = useRef<string | null>(null)
  const mounted = useRef(true)
  function releaseFile() {
    if (resultUrl.current) URL.revokeObjectURL(resultUrl.current)
    resultUrl.current = null
  }
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      controller.current?.abort()
      releaseFile()
    }
  }, [])

  async function start(project: Document) {
    if (controller.current) return
    releaseFile()
    const job = new AbortController()
    controller.current = job
    setStatus({phase: 'starting'})
    try {
      const {exportVideo} = await import('./video-export')
      job.signal.throwIfAborted()
      const file = await exportVideo(project, job.signal, progress => {
        if (mounted.current && !job.signal.aborted) setStatus({phase: 'encoding', progress})
      })
      job.signal.throwIfAborted()
      if (!mounted.current) return
      const url = URL.createObjectURL(file)
      resultUrl.current = url
      setStatus({phase: 'ready', file, url})
    } catch (error) {
      if (mounted.current) setStatus({phase: 'message', text: job.signal.aborted
        ? 'Video export cancelled.'
        : error instanceof Error ? error.message : 'Video export failed. Try again with a shorter composition.'})
    } finally {
      controller.current = null
    }
  }

  const busy = status?.phase === 'starting' || status?.phase === 'encoding' || status?.phase === 'cancelling'
  return {
    status, busy, start,
    cancel: () => { if (controller.current) {setStatus({phase: 'cancelling'}); controller.current.abort()} },
    dismiss: () => { releaseFile(); setStatus(null) },
  }
}

export function VideoExportPanel({status, busy, cancel, dismiss}: ReturnType<typeof useVideoExport>) {
  const [shareError, setShareError] = useState(false)
  useEffect(() => {setShareError(false)}, [status])
  if (!status) return null
  const progress = status.phase === 'encoding' ? status.progress : undefined
  const shareable = status.phase === 'ready' && typeof navigator.share === 'function' &&
    navigator.canShare?.({files: [status.file]})
  return <section className="video-export-panel" aria-label="Video export">
    <header><strong>{status.phase === 'ready' ? 'Video ready' : 'Video export'}</strong>
      {busy
        ? <button className="small-button" onClick={cancel} disabled={status.phase === 'cancelling'}>Cancel</button>
        : <button className="small-button" onClick={dismiss}>Dismiss</button>}
    </header>
    {busy && <div aria-live="polite" aria-atomic="true">
      {progress ? <>
        <progress aria-label="Encoded frames" max={progress.total} value={progress.frames}/>
        <p>{progress.frames} / {progress.total} frames · {Math.floor(progress.frames / progress.total * 100)}% · {progress.seconds.toFixed(2)}s · {progress.format.toUpperCase()}</p>
      </> : <p>{status.phase === 'cancelling' ? 'Stopping export…' : 'Preparing local encoder…'}</p>}
    </div>}
    {status.phase === 'message' && <p role="status">{status.text}</p>}
    {status.phase === 'ready' && <>
      <p role="status" className="video-filename">{status.file.name} · 1080 × 1920 · 30 fps</p>
      {status.file.type === 'video/webm' && <p>This browser exported WebM. Instagram may require MP4.</p>}
      <div className="video-export-actions">
        <a className="toolbar-button export-button" href={status.url} download={status.file.name}>Download video</a>
        {shareable && <button className="toolbar-button" onClick={() => {
          setShareError(false)
          void navigator.share({files: [status.file]}).catch(error => {if (error?.name !== 'AbortError') setShareError(true)})
        }}>Share file</button>}
      </div>
      <p>{shareError ? 'Sharing failed. Use Download video to save the file.' : 'On iPhone, use Downloads in Files, or choose Save to Files when sharing is available.'}</p>
    </>}
  </section>
}
