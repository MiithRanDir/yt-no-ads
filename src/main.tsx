import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// ponytail: ลงทะเบียน service worker เพื่อให้ติดตั้งเป็นแอปได้ (เงียบถ้าไม่รองรับ)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
