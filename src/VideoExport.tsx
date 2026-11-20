import {useEffect, useRef, useState} from 'react'
import type {Document} from './model'
import {diagnosticText, VideoExportError, type VideoDiagnostics, type VideoResolution} from './video-diagnostics'
import type {VideoProgress} from './video-export'

type Status =
  | {phase: 'starting'}
  | {phase: 'encoding'; progress: VideoProgress}
  | {phase: 'cancelling'}
  | {phase: 'ready'; file: File; url: string; diagnostics: VideoDiagnostics}
  | {phase: 'message'; text: string; diagnostics?: VideoDiagnostics; retry?: Document}

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

  async function start(project: Document, resolution: VideoResolution = '1080p') {
    if (controller.current) return
    releaseFile()
    const job = new AbortController()
    controller.current = job
    setStatus({phase: 'starting'})
    try {
      const {exportVideo} = await import('./video-export')
      job.signal.throwIfAborted()
      const {file, diagnostics} = await exportVideo(project, job.signal, progress => {
        if (mounted.current && !job.signal.aborted) setStatus({phase: 'encoding', progress})
      }, resolution)
      job.signal.throwIfAborted()
      if (!mounted.current) return
      const url = URL.createObjectURL(file)
      resultUrl.current = url
      setStatus({phase: 'ready', file, url, diagnostics})
    } catch (error) {
      const diagnostics = error instanceof VideoExportError ? error.diagnostics : undefined
      if (mounted.current) setStatus({phase: 'message',
        text: job.signal.aborted ? 'Video export cancelled.' : error instanceof VideoExportError
          ? error.message : 'Video export could not start. Reload Text Lab and try again.',
        diagnostics,
        retry: !job.signal.aborted && resolution === '1080p' && diagnostics && diagnostics.stage !== 'API' ? project : undefined,
      })
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

export function VideoExportPanel({status, busy, cancel, dismiss, start}: ReturnType<typeof useVideoExport>) {
  const [shareError, setShareError] = useState(false)
  const [showPlayer, setShowPlayer] = useState(false)
  const [playbackError, setPlaybackError] = useState<number>()
  const [copyStatus, setCopyStatus] = useState('')
  const diagnosticField = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    setShareError(false)
    setShowPlayer(false)
    setPlaybackError(undefined)
    setCopyStatus('')
  }, [status])
  if (!status) return null
  const progress = status.phase === 'encoding' ? status.progress : undefined
  const shareable = status.phase === 'ready' && typeof navigator.share === 'function' &&
    navigator.canShare?.({files: [status.file]})
  const diagnostics = status.phase === 'message' || status.phase === 'ready' ? status.diagnostics : undefined
  const report = diagnostics ? diagnosticText(playbackError === undefined ? diagnostics : {...diagnostics,
    stage: 'browser playback', error: {name: 'MediaError', message: `Media error code ${playbackError}. The browser player could not open or decode this file.`},
  }) : ''
  return <section className="video-export-panel" aria-label="Video export">
    <header><strong>{status.phase === 'ready' ? 'Video ready' : 'Video export'}</strong>
      {busy
        ? <button key="cancel" className="small-button" onClick={cancel} disabled={status.phase === 'cancelling'}>Cancel</button>
        : <button key="dismiss" className="small-button" onClick={dismiss}>Dismiss</button>}
    </header>
    {busy && <div aria-live="polite" aria-atomic="true">
      {progress ? <>
        <progress aria-label="Encoded frames" max={progress.total} value={progress.frames}/>
        <p>{progress.frames} / {progress.total} frames · {Math.floor(progress.frames / progress.total * 100)}% · {progress.seconds.toFixed(2)}s · {progress.format.toUpperCase()} · {progress.width} × {progress.height}</p>
      </> : <p>{status.phase === 'cancelling' ? 'Stopping export…' : 'Preparing local encoder…'}</p>}
    </div>}
    {status.phase === 'message' && <>
      <p role="status">{status.text}</p>
      {status.retry && <div className="video-export-actions">
        <button className="toolbar-button" onClick={() => {
          if (status.retry) void start(status.retry, '720p')
        }}>Retry at 720p</button>
      </div>}
      {diagnostics && diagnostics.stage !== 'abort' && diagnostics.stage !== 'API' &&
        <p>To export on another device, use Export JSON and open the document in a current desktop Safari or Chromium browser with encoder support.</p>}
    </>}
    {status.phase === 'ready' && <>
      <p role="status" className="video-filename">{status.file.name} · {status.diagnostics.width} × {status.diagnostics.height} · {status.diagnostics.fps} fps</p>
      {status.file.type === 'video/webm' && <p>This browser exported WebM. Instagram may require MP4.</p>}
      <div className="video-export-actions">
        <a className="toolbar-button export-button" href={status.url} download={status.file.name}>Download video</a>
        <button className="toolbar-button" aria-expanded={showPlayer} onClick={() => setShowPlayer(!showPlayer)}>{showPlayer ? 'Hide player' : 'Preview video'}</button>
        {shareable && <button className="toolbar-button" onClick={() => {
          setShareError(false)
          void navigator.share({files: [status.file]}).catch(error => {if (error?.name !== 'AbortError') setShareError(true)})
        }}>Share file</button>}
      </div>
      {showPlayer && <video aria-label="Exported video" controls playsInline preload="metadata" src={status.url}
        onError={event => setPlaybackError(event.currentTarget.error?.code ?? 0)}/>}
      {playbackError !== undefined && <p role="alert">Playback failed in this browser. Save the file to try it in Files and include the diagnostics when reporting the issue.</p>}
      <p>{shareError ? 'Sharing failed. Use Download video to save the file.' : 'On iPhone, use Downloads in Files, or choose Save to Files when sharing is available.'}</p>
    </>}
    {diagnostics && <details>
      <summary>Export diagnostics</summary>
      <textarea ref={diagnosticField} aria-label="Diagnostic report" value={report} readOnly rows={5}/>
      <button className="small-button" onClick={async () => {
        try {
          await navigator.clipboard.writeText(report)
          setCopyStatus('Diagnostics copied.')
        } catch {
          diagnosticField.current?.focus()
          diagnosticField.current?.select()
          setCopyStatus('Select and copy the report above.')
        }
      }}>Copy diagnostics</button>
      {copyStatus && <p role="status">{copyStatus}</p>}
    </details>}
  </section>
}
