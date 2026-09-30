import { useState } from 'react'

interface Props {
  onSearch: (q: string) => void
  onType?: (q: string) => void
}

export default function SearchBar({ onSearch, onType }: Props) {
  const [q, setQ] = useState('')
  return (
    <form
      className="search"
      onSubmit={(e) => {
        e.preventDefault()
        onSearch(q)
      }}
    >
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          onType?.(e.target.value)
        }}
        placeholder="ค้นหา YouTube…"
        aria-label="ค้นหา"
      />
      <button type="submit">ค้นหา</button>
    </form>
  )
}
