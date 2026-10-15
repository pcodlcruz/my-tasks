import { useEffect } from 'react'

// When a modal closes, focus returns to the element that opened it (WCAG 2.4.3).
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
