import React from 'react'
import ReactDOM from 'react-dom/client'
import { WorkspaceShell } from './control-room/shell/WorkspaceShell'
import { applyTheme, resolveTheme } from './control-room/shell/theme'
import './index.css'

/**
 * Stamp the theme class before the first render.
 *
 * This is the bundle's copy of the boot script, not a replacement for it: by the time this module
 * runs the browser has already painted once, so a light-mode user still sees a dark flash. The
 * script that actually prevents the flash has to be inline in `client/index.html`.
 */
applyTheme(resolveTheme())

/**
 * One surface. The workspace owns every path, including `/`.
 *
 * This file used to mount three: the original OpenUI terminal canvas at `/`, the old control room
 * behind `?view=control-room`, and the workspace on its own five paths — with a toggle in the corner
 * and `/` deliberately left unclaimed, so that retiring the canvas would be a decision rather than a
 * side effect of a routing change.
 *
 * That decision has been taken. Neither `App` nor `ControlRoomApp` is imported here any more, so
 * neither is in the bundle. Both modules still exist and the server still serves the APIs they used;
 * what changed is that nothing in the product routes to them. `/` needs no redirect — the router
 * already resolves it to DEFAULT_PAGE, which is where work is declared.
 */

// `?view=control-room` was the old control room's entry point. Strip it rather than honour it, so a
// stale bookmark opens the workspace with a clean URL instead of carrying a parameter nothing reads.
if (new URLSearchParams(location.search).has('view')) {
  const url = new URL(location.href)
  url.searchParams.delete('view')
  history.replaceState(null, '', url)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WorkspaceShell />
  </React.StrictMode>,
)
