import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ControlRoomApp } from './control-room/ControlRoomApp'
import './index.css'

/**
 * Two surfaces share one app: the original OpenUI terminal canvas, and the Grok Build Control
 * Room. The choice is in the URL (?view=control-room) so it is linkable and survives a reload,
 * with a persistent toggle for switching.
 */
function Root() {
  const [view, setView] = useState<'canvas' | 'control-room'>(() =>
    new URLSearchParams(location.search).get('view') === 'control-room' ? 'control-room' : 'canvas',
  )

  useEffect(() => {
    const url = new URL(location.href)
    if (view === 'control-room') url.searchParams.set('view', 'control-room')
    else url.searchParams.delete('view')
    history.replaceState(null, '', url)
  }, [view])

  return (
    <div className="w-screen h-screen overflow-hidden">
      <button
        type="button"
        data-testid="view-toggle"
        onClick={() => setView(view === 'canvas' ? 'control-room' : 'canvas')}
        className="fixed bottom-4 right-4 z-[100000] rounded-full border border-white/15 bg-neutral-900/95 px-3 py-1.5 text-xs text-white shadow-lg hover:bg-neutral-800"
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
