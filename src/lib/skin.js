// A whole-app visual skin, switched on with ?skin=katipolt in the URL.
//
// This exists so a redesign can be looked at against real data on the real
// site without anyone else's view changing. The default is untouched: with
// no flag, or ?skin=off, the app renders exactly as it always has.
//
// The flag is mirrored into sessionStorage because urlState.js rewrites the
// query string from scratch on every in-app navigation — without this the
// skin would fall off the moment you clicked a tab. sessionStorage rather
// than localStorage so it lasts the visit and no longer: a preview you can't
// work out how to turn off is a bug.
const KEY = 'skin'
const VALID = ['katipolt']

export function readSkin() {
  let requested = null
  try {
    requested = new URL(window.location.href).searchParams.get('skin')
  } catch {
    // Malformed URL — fall through to whatever the session already had.
  }

  try {
    if (requested === 'off') {
      sessionStorage.removeItem(KEY)
      return null
    }
    if (requested && VALID.includes(requested)) {
      sessionStorage.setItem(KEY, requested)
      return requested
    }
    const stored = sessionStorage.getItem(KEY)
    return VALID.includes(stored) ? stored : null
  } catch {
    // Storage blocked: honour the URL for this page load and don't persist.
    return requested && VALID.includes(requested) ? requested : null
  }
}

// Set as an attribute on <html> rather than passed down as a prop, so plain
// CSS can retheme everything — including the many components that hardcode
// their colours — without every one of them needing to know a skin exists.
export function applySkin(skin) {
  const root = document.documentElement
  if (skin) root.setAttribute('data-skin', skin)
  else root.removeAttribute('data-skin')
  return skin
}
