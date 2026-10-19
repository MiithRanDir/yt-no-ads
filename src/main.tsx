import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// ponytail: ลงทะเบียน service worker + auto-reload ตอนมี version ใหม่
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // version ใหม่พร้อม — reload หน้า
            window.location.reload()
          }
        })
      })
    }).catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
