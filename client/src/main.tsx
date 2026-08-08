import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ControlRoomApp } from './control-room/ControlRoomApp'
import { WorkspaceShell } from './control-room/shell/WorkspaceShell'
import { isWorkspacePath } from './control-room/shell/router'
import { applyTheme, resolveTheme } from './control-room/shell/theme'
import './index.css'

/**
 * Stamp the theme class before the first render.
 *
 * This is the bundle's copy of the boot script, not a replacement for it: by the time this module
 * runs the browser has already painted once, so a light-mode user still sees a dark flash. The
 * script that actually prevents the flash has to be inline in `client/index.html`, which is a hot
 * file — filed as request R-2, with its verbatim text.
 */
applyTheme(resolveTheme())

/**
 * Three surfaces share one bundle while the pivot is in flight.
 *
 * `/agents`, `/assets`, `/designdocs`, `/users` and `/x` are the workspace. Everything else is
 * still the original OpenUI canvas, with the control room behind `?view=control-room`.
 *
 * `/` is deliberately NOT claimed yet. §3.4 gives it to the workspace — it redirects to the front
 * door — but taking it here would retire the legacy canvas as a side effect of a routing change,
 * and that retirement is row 6's job, done deliberately alongside the identity strings and the
 * toggle below. Routes first, then the switch.
 */
function workspaceRequested(): boolean {
  return location.pathname !== '/' && isWorkspacePath(location.pathname)
}

function Root() {
  const [workspace, setWorkspace] = useState(workspaceRequested)
  const [view, setView] = useState<'canvas' | 'control-room'>(() =>
    new URLSearchParams(location.search).get('view') === 'control-room' ? 'control-room' : 'canvas',
  )

  // The workspace owns its own history; this only decides which surface is mounted, so it has to
  // re-check when the user navigates back out of the workspace.
  useEffect(() => {
    const sync = () => setWorkspace(workspaceRequested())
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  useEffect(() => {
    if (workspace) return
    const url = new URL(location.href)
    if (view === 'control-room') url.searchParams.set('view', 'control-room')
    else url.searchParams.delete('view')
    history.replaceState(null, '', url)
  }, [view, workspace])

  if (workspace) return <WorkspaceShell />

  return (
    <div className="w-screen h-screen overflow-hidden">
      <button
        type="button"
        data-testid="view-toggle"
        onClick={() => setView(view === 'canvas' ? 'control-room' : 'canvas')}
        className="fixed bottom-4 right-4 z-[100000] rounded-full border border-border bg-surface/95 px-3 py-1.5 text-xs text-ink shadow-panel hover:bg-surface-hover"
      >
        {view === 'canvas' ? 'Open Control Room →' : '← Back to Canvas'}
      </button>
      {view === 'control-room' ? <ControlRoomApp /> : <App />}
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
