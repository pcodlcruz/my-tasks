// Applies the saved theme and density to <html> before the first paint (no flash).
// Loaded synchronously from <head>; it must stay dependency-free and mirror
// src/lib/appearance.ts (same cache key, same defaults, same resolution of "system").
;(function () {
  var theme = 'system'
  var density = 'comfortable'
  try {
    var raw = window.localStorage.getItem('mytasks.appearance')
    var cached = raw === null ? null : JSON.parse(raw)
    if (cached && typeof cached === 'object') {
      if (cached.theme === 'light' || cached.theme === 'dark' || cached.theme === 'system') {
        theme = cached.theme
      }
      if (cached.density === 'comfortable' || cached.density === 'compact') {
        density = cached.density
      }
    }
  } catch (error) {
    // Storage unavailable or corrupt cache: keep the defaults.
  }
  var resolved = theme
  if (theme === 'system') {
    resolved =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
  }
  var root = document.documentElement
  root.setAttribute('data-theme', resolved)
  root.setAttribute('data-density', density)
})()
