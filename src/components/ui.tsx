import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">{children}</div>
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-line bg-panel p-4 sm:p-5 ${className}`}>
      {children}
    </div>
  )
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger'
}) {
  const styles =
    variant === 'primary'
      ? 'bg-lime text-ink hover:brightness-95'
      : variant === 'danger'
        ? 'bg-red-900/40 text-red-200 hover:bg-red-900/60'
        : 'border border-line bg-transparent text-muted hover:text-white hover:border-muted'
  return (
    <button
      className={`inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${styles} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-sm outline-none focus:border-lime ${props.className ?? ''}`}
    />
  )
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-sm outline-none focus:border-lime ${props.className ?? ''}`}
    />
  )
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-sm outline-none focus:border-lime ${props.className ?? ''}`}
    />
  )
}
