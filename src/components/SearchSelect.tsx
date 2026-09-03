import { useMemo, useState } from 'react'
import { Field, TextInput } from './ui.tsx'

export type SearchSelectOption = {
  id: string
  label: string
  detail?: string
}

export function SearchSelect({
  label,
  placeholder,
  options,
  valueId,
  onChange,
}: {
  label: string
  placeholder?: string
  options: SearchSelectOption[]
  valueId: string
  onChange: (id: string) => void
}) {
  const selected = options.find((option) => option.id === valueId) ?? null
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  // While closed the field shows the current selection; typing only matters
  // once the list is open.
  const text = open ? query : selected?.label ?? ''

  const matches = useMemo(() => {
    const search = open ? query.trim().toLowerCase() : ''
    if (!search) return options
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(search) ||
        (option.detail?.toLowerCase().includes(search) ?? false),
    )
  }, [open, options, query])

  const openList = () => {
    setQuery('')
    setActive(0)
    setOpen(true)
  }

  const choose = (option: SearchSelectOption) => {
    onChange(option.id)
    setOpen(false)
  }

  return (
    <Field label={label}>
      <div className="relative">
        <TextInput
          autoComplete="off"
          placeholder={placeholder}
          value={text}
          onFocus={openList}
          onChange={(event) => {
            if (!open) openList()
            setQuery(event.target.value)
            setActive(0)
            if (valueId) onChange('')
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              if (!open) openList()
              setActive((index) => (matches.length ? (index + 1) % matches.length : 0))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              if (!open) openList()
              setActive((index) =>
                matches.length ? (index - 1 + matches.length) % matches.length : 0,
              )
            } else if (event.key === 'Enter') {
              event.preventDefault()
              const option = matches[active]
              if (open && option) choose(option)
            } else if (event.key === 'Escape') {
              setOpen(false)
            }
          }}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120)
          }}
        />
        {open && (
          <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-line bg-ink">
            {matches.map((option, index) => (
              <li key={option.id}>
                <button
                  type="button"
                  className={`flex min-h-11 w-full flex-col items-start justify-between gap-1 px-3 py-2 text-left text-sm sm:flex-row sm:items-center sm:gap-2 ${
                    index === active ? 'bg-lime/15 text-white' : 'text-muted hover:bg-panel'
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(option)}
                >
                  <span className="min-w-0 break-words font-medium text-white">{option.label}</span>
                  {option.detail ? (
                    <span className="break-words text-xs text-muted sm:text-right">
                      {option.detail}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
            {matches.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted">No matches.</li>
            )}
          </ul>
        )}
      </div>
    </Field>
  )
}
