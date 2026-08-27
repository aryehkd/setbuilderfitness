import { Field, Select, TextArea, TextInput } from './ui.tsx'
import { TIMEZONES } from '../lib/timezones.ts'

export const DEFAULT_ACCENT_COLOR = '#c6f54e'

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
        <Field label="Accent color">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={isAccentColor(draft.accentColor) ? draft.accentColor : DEFAULT_ACCENT_COLOR}
              aria-label="Accent color"
              className="h-11 w-16 cursor-pointer rounded-xl border border-line bg-ink p-1"
              onChange={(e) => onChange({ ...draft, accentColor: e.target.value })}
            />
            <TextInput
              value={draft.accentColor}
              aria-label="Accent color hex value"
              maxLength={7}
              pattern="#[0-9a-fA-F]{6}"
              className="max-w-36 font-mono uppercase"
              onChange={(e) => onChange({ ...draft, accentColor: e.target.value })}
            />
            <span
              className="h-8 flex-1 rounded-lg"
              style={{ backgroundColor: draft.accentColor }}
              aria-hidden="true"
            />
          </div>
        </Field>
      </div>
    </div>
  )
}
