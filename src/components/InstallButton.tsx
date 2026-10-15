import { useEffect, useState } from 'react'

// ponytail: ปุ่มติดตั้ง PWA — โผล่เฉพาะตอน browser แจก install event (Chrome/Edge)
// iPhone ไม่มี event นี้ ให้ Share → Add to Home Screen แทน
interface BIPEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: string }>
}

type Win = Pick<Window, 'addEventListener' | 'removeEventListener'>

export default function InstallButton() {
  const [evt, setEvt] = useState<BIPEvent | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setDone(true)
      return
    }
    const w = window as unknown as Win
    const onBip = (e: Event) => {
      e.preventDefault()
      setEvt(e as BIPEvent)
    }
    const onInstalled = () => {
      setDone(true)
      setEvt(null)
    }
    w.addEventListener('beforeinstallprompt', onBip)
    w.addEventListener('appinstalled', onInstalled)
    return () => {
      w.removeEventListener('beforeinstallprompt', onBip)
      w.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (done || !evt) return null
  return (
    <button
      className="installbtn"
      title="ติดตั้งเป็นแอปบนเครื่อง"
      onClick={() => {
        evt
          .prompt()
          .catch(() => {})
          .finally(() => setEvt(null))
      }}
    >
      ⤓ ติดตั้ง
    </button>
  )
}
