import { useEffect } from 'react'

// Al cerrarse un modal, el foco vuelve al elemento que lo abrió (WCAG 2.4.3).
export function useRestoreFocus(): void {
  useEffect(() => {
    const previous = document.activeElement
    return () => {
      if (previous instanceof HTMLElement) {
        previous.focus()
      }
    }
  }, [])
}
