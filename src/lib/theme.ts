import { useEffect, useState } from 'react'

export type ThemeChoice = 'system' | 'light' | 'dark'
export type Resolved = 'light' | 'dark'

const KEY = 'rtw.theme'

export function storedChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    // Private browsing can throw on access; the system setting is a fine default.
    return 'system'
  }
}

export function systemTheme(): Resolved {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function resolve(choice: ThemeChoice): Resolved {
  return choice === 'system' ? systemTheme() : choice
}

/**
 * Apply a choice to the document.
 *
 * 'system' removes the attribute entirely rather than writing the current
 * system value, so the page keeps following the OS if it changes later.
 */
export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement
  if (choice === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', choice)
  try {
    if (choice === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    // Not being able to remember the choice is not worth failing over.
  }
}

/** Current choice, what it resolves to, and a setter. */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(storedChoice)
  const [resolved, setResolved] = useState<Resolved>(() => resolve(storedChoice()))

  useEffect(() => {
    applyTheme(choice)
    setResolved(resolve(choice))

    if (choice !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setResolved(systemTheme())
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [choice])

  return { choice, resolved, setChoice }
}
