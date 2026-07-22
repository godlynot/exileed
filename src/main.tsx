import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ErrorBoundary } from './ErrorBoundary.tsx'
import './index.css'

window.addEventListener('error', (event) => {
  const root = document.getElementById('root')
  if (root) {
    root.innerHTML = `<div class="min-h-screen bg-[#0b0c10] text-gray-100 p-8 font-mono">
      <h1 class="text-2xl text-red-500 mb-4">Runtime Error</h1>
      <pre class="bg-[#15161d] p-4 rounded text-sm overflow-auto whitespace-pre-wrap">${event.error?.message ?? event.message}</pre>
      <pre class="mt-4 text-xs text-gray-400">${event.error?.stack ?? ''}</pre>
    </div>`
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
