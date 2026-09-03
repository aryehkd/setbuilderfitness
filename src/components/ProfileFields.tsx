import { useEffect, useRef, useState } from 'react'
import { Field, Select, TextArea, TextInput } from './ui.tsx'
import { TIMEZONES } from '../lib/timezones.ts'

export const DEFAULT_ACCENT_COLOR = '#c6f54e'

/**
 * Accent options, kept light so they stay readable as text and as button fills
 * on the dark app background.
 */
export const ACCENT_COLORS = [
  { value: '#c6f54e', label: 'Lime' },
  { value: '#a3e635', label: 'Apple' },
  { value: '#86efac', label: 'Mint' },
  { value: '#6ee7b7', label: 'Seafoam' },
  { value: '#5eead4', label: 'Teal' },
  { value: '#67e8f9', label: 'Aqua' },
  { value: '#7dd3fc', label: 'Sky' },
  { value: '#93c5fd', label: 'Cornflower' },
  { value: '#a5b4fc', label: 'Periwinkle' },
  { value: '#c4b5fd', label: 'Lavender' },
  { value: '#d8b4fe', label: 'Lilac' },
  { value: '#f0abfc', label: 'Orchid' },
  { value: '#f9a8d4', label: 'Rose' },
  { value: '#fda4af', label: 'Blush' },
  { value: '#fca5a5', label: 'Coral' },
  { value: '#fdba74', label: 'Apricot' },
  { value: '#fcd34d', label: 'Amber' },
  { value: '#fde047', label: 'Sunshine' },
  { value: '#e2e8f0', label: 'Cloud' },
  { value: '#d6d3d1', label: 'Stone' },
]

export type ProfileDraft = {
  name: string
  email: string
  phone: string
  location: string
  website: string
  timezone: string
  bio: string
  accentColor: string
}

export function emptyProfileDraft(seed?: {
  name?: string
  email?: string
  accentColor?: string
}): ProfileDraft {
  return {
    name: seed?.name ?? '',
    email: seed?.email ?? '',
    phone: '',
    location: '',
    website: '',
    timezone: '',
    bio: '',
    accentColor: seed?.accentColor || DEFAULT_ACCENT_COLOR,
  }
}

export function isAccentColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value)
}

export function isTrainerProfileComplete(draft: ProfileDraft) {
  return Boolean(
    draft.name.trim() &&
      draft.email.includes('@') &&
      draft.timezone &&
      draft.bio.trim() &&
      isAccentColor(draft.accentColor),
  )
}

function AccentColorPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const selected = ACCENT_COLORS.find((color) => color.value.toLowerCase() === value.toLowerCase())

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={container} className="relative inline-flex">
      <button
        type="button"
        aria-label={`Theme color${selected ? `: ${selected.label}` : ''}`}
        aria-expanded={open}
        className="h-11 w-16 rounded-xl border border-line p-1 hover:border-muted"
        onClick={() => setOpen((current) => !current)}
      >
        <span
          className="block h-full w-full rounded-lg"
          style={{ backgroundColor: isAccentColor(value) ? value : DEFAULT_ACCENT_COLOR }}
        />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-2 w-64 rounded-xl border border-line bg-panel p-3 shadow-lg">
          <div className="grid grid-cols-5 gap-2">
            {ACCENT_COLORS.map((color) => (
              <button
                key={color.value}
                type="button"
                title={color.label}
                aria-label={color.label}
                aria-pressed={color.value.toLowerCase() === value.toLowerCase()}
                className={`h-9 w-9 rounded-lg border-2 ${
                  color.value.toLowerCase() === value.toLowerCase()
                    ? 'border-white'
                    : 'border-transparent hover:border-muted'
                }`}
                style={{ backgroundColor: color.value }}
                onClick={() => {
                  onChange(color.value)
                  setOpen(false)
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function ProfileFields({
  draft,
  onChange,
}: {
  draft: ProfileDraft
  onChange: (next: ProfileDraft) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Name">
        <TextInput
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
      </Field>
      <Field label="Email">
        <TextInput
          type="email"
          value={draft.email}
          onChange={(e) => onChange({ ...draft, email: e.target.value })}
        />
      </Field>
      <Field label="Phone (optional)">
        <TextInput
          type="tel"
          value={draft.phone}
          onChange={(e) => onChange({ ...draft, phone: e.target.value })}
        />
      </Field>
      <Field label="Location (optional)">
        <TextInput
          placeholder="City, state"
          value={draft.location}
          onChange={(e) => onChange({ ...draft, location: e.target.value })}
        />
      </Field>
      <Field label="Website (optional)">
        <TextInput
          placeholder="https://"
          value={draft.website}
          onChange={(e) => onChange({ ...draft, website: e.target.value })}
        />
      </Field>
      <Field label="Timezone">
        <Select
          value={draft.timezone}
          onChange={(e) => onChange({ ...draft, timezone: e.target.value })}
        >
          <option value="">—</option>
          {TIMEZONES.map((zone) => (
            <option key={zone.value} value={zone.value}>
              {zone.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Bio">
          <TextArea
            rows={4}
            value={draft.bio}
            onChange={(e) => onChange({ ...draft, bio: e.target.value })}
          />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <label className="flex items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Theme color
          </span>
          <AccentColorPicker
            value={draft.accentColor}
            onChange={(accentColor) => onChange({ ...draft, accentColor })}
          />
        </label>
      </div>
    </div>
  )
}
