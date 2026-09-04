/**
 * Marker figures.
 *
 * Everyone gets the runner for now, but this is a registry rather than a
 * constant so that adding a cyclist or letting users pick one later is a
 * matter of adding an entry and storing a key on the profile.
 */

export type AvatarId = 'runner'

export const DEFAULT_AVATAR: AvatarId = 'runner'

// Drawn as strokes with round caps: a silhouette at this size reads as a blob,
// whereas a stick figure stays legible down to about 20 px.
const RUNNER = `
  <circle cx="16" cy="4.6" r="2.3" fill="currentColor" stroke="none"/>
  <path d="M15 8.2 11.8 13.4"/>
  <path d="M15.2 9.1 18.7 10.9 18.2 14.1"/>
  <path d="M14.1 9.7 10.4 9.1 8.7 11.7"/>
  <path d="M11.8 13.4 14.7 16.3 13.5 20.7"/>
  <path d="M11.8 13.4 8.3 15.5 8.9 19.9"/>
`

const FIGURES: Record<AvatarId, string> = { runner: RUNNER }

/**
 * Map marker element: the figure in a coloured badge, ringed in white so it
 * stays visible against both the pale basemap and the route lines.
 */
export function avatarMarker(id: AvatarId = DEFAULT_AVATAR, size = 38): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('aria-label', 'Your position')
  el.style.cssText = `
    width:${size}px;height:${size}px;border-radius:9999px;
    background:#15803d;border:3px solid #fff;
    box-shadow:0 2px 6px rgba(0,0,0,.45);
    display:grid;place-items:center;cursor:default;
  `
  el.innerHTML = `
    <svg viewBox="0 0 24 24" width="${size * 0.66}" height="${size * 0.66}"
         fill="none" stroke="#fff" stroke-width="2.1"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      ${FIGURES[id]}
    </svg>
  `
  return el
}
