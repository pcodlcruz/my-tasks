import '@testing-library/jest-dom/vitest'

// jsdom has no PointerEvent: without one, `fireEvent.pointerDown(el, { clientX })` builds a plain
// Event and the coordinates are lost. A MouseEvent that also carries the pointer fields is enough.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
      this.pointerType = init.pointerType ?? 'mouse'
    }
  }
  Object.defineProperty(window, 'PointerEvent', { value: PointerEventPolyfill, configurable: true })
}
