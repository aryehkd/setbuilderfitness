import { Field, NumericTextInput } from './ui.tsx'
import type { Tempo } from '../../shared/types.ts'

export function Toggle({
  value,
  onChange,
}: {
  value: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="inline-flex rounded-xl border border-line p-1 text-sm">
      <button
        type="button"
        className={`min-h-11 rounded-lg px-4 py-1.5 ${!value ? 'bg-lime text-accent-contrast' : 'text-muted'}`}
        onClick={() => onChange(false)}
      >
        No
      </button>
      <button
        type="button"
        className={`min-h-11 rounded-lg px-4 py-1.5 ${value ? 'bg-lime text-accent-contrast' : 'text-muted'}`}
        onClick={() => onChange(true)}
      >
        Yes
      </button>
    </div>
  )
}

export function ModeToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (next: T) => void
}) {
  return (
    <div className="inline-flex shrink-0 rounded-xl border border-line p-1 text-sm">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`min-h-11 whitespace-nowrap rounded-lg px-3 py-1.5 sm:px-4 ${
            value === option.value ? 'bg-lime text-accent-contrast' : 'text-muted'
          }`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function TempoFields({
  value,
  onChange,
}: {
  value: Tempo
  onChange: (next: Tempo, persist?: boolean) => void
}) {
  const num = (raw: string) => (raw ? Number(raw) : null)
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <Field label="Time down (s)">
        <NumericTextInput
          value={value.eccentric ?? ''}
          onChange={(e) => onChange({ ...value, eccentric: num(e.target.value) })}
          onBlur={(e) => onChange({ ...value, eccentric: num(e.target.value) }, true)}
        />
      </Field>
      <Field label="Pause (s)">
        <NumericTextInput
          value={value.pauseBottom ?? ''}
          onChange={(e) => onChange({ ...value, pauseBottom: num(e.target.value) })}
          onBlur={(e) => onChange({ ...value, pauseBottom: num(e.target.value) }, true)}
        />
      </Field>
      <Field label="Time up (s)">
        <NumericTextInput
          value={value.concentric ?? ''}
          onChange={(e) => onChange({ ...value, concentric: num(e.target.value) })}
          onBlur={(e) => onChange({ ...value, concentric: num(e.target.value) }, true)}
        />
      </Field>
      <Field label="Pause top (s)">
        <NumericTextInput
          value={value.pauseTop ?? ''}
          onChange={(e) => onChange({ ...value, pauseTop: num(e.target.value) })}
          onBlur={(e) => onChange({ ...value, pauseTop: num(e.target.value) }, true)}
        />
      </Field>
    </div>
  )
}
