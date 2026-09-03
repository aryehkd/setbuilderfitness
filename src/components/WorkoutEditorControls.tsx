import { useState, type ReactNode } from 'react'
import { Field, NumericTextInput, Button } from './ui.tsx'
import type { Tempo } from '../../shared/types.ts'

export type SaveDefaultStatus = 'idle' | 'saving' | 'saved'

export function clearCompletedDefaultSaves(
  current: Record<string, SaveDefaultStatus>,
): Record<string, SaveDefaultStatus> {
  let changed = false
  const next: Record<string, SaveDefaultStatus> = {}
  for (const [key, status] of Object.entries(current)) {
    if (status === 'saving') next[key] = 'saving'
    else changed = true
  }
  return changed ? next : current
}

export function SpinnerIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={`h-4 w-4 shrink-0 animate-spin ${className}`}
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path
        d="M17 10a7 7 0 0 0-7-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={`h-4 w-4 shrink-0 ${className}`}
      aria-hidden="true"
    >
      <path
        d="M4.5 10.5 8 14l7.5-8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SaveDefaultButton({
  status = 'idle',
  onClick,
  label = 'save config as default',
}: {
  status?: SaveDefaultStatus
  onClick: () => void
  label?: string
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="gap-2"
      disabled={status === 'saving'}
      aria-busy={status === 'saving'}
      aria-label={status === 'saved' ? `${label} (saved)` : label}
      onClick={onClick}
    >
      {status === 'saving' ? <SpinnerIcon /> : null}
      {status === 'saved' ? <CheckIcon className="text-lime" /> : null}
      {label}
    </Button>
  )
}

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

export function InfoTip({
  label,
  children,
  align = 'left',
}: {
  label: string
  children: ReactNode
  /** Which corner of the tooltip is pinned to the icon. */
  align?: 'left' | 'right'
}) {
  const [anchor, setAnchor] = useState<{ left?: number; right?: number; top: number } | null>(null)

  const show = (event: { currentTarget: HTMLElement }) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setAnchor(
      align === 'right'
        ? { right: window.innerWidth - rect.right, top: rect.bottom + 8 }
        : { left: rect.left, top: rect.bottom + 8 },
    )
  }

  return (
    <span className="inline-flex">
      <button
        type="button"
        aria-label={label}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-line text-[10px] leading-none text-muted hover:border-muted hover:text-white"
        onMouseEnter={show}
        onMouseLeave={() => setAnchor(null)}
        onFocus={show}
        onBlur={() => setAnchor(null)}
      >
        i
      </button>
      {anchor ? (
        <span
          role="tooltip"
          style={{ left: anchor.left, right: anchor.right, top: anchor.top }}
          className="pointer-events-none fixed z-30 w-72 rounded-xl border border-line bg-ink p-3 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-muted shadow-lg"
        >
          {children}
        </span>
      ) : null}
    </span>
  )
}

export function BlockDragHelp() {
  return (
    <InfoTip label="How dragging blocks works">
      Drag a movement by its handle, then drop it on:
      <span className="mt-2 block">
        <span className="block">
          <strong className="text-white">A line</strong> to move it there. Dragging a
          superset&rsquo;s first movement moves the whole group.
        </span>
        <span className="mt-1 block">
          <strong className="text-white">Another movement</strong> to superset them; the
          highlighted letter previews the result.
        </span>
        <span className="mt-1 block">
          Leaving a superset drops the movement out of it, and a group left with one
          movement becomes a single again.
        </span>
      </span>
    </InfoTip>
  )
}
