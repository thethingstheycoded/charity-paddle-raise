import { useState, useCallback } from 'react'

// ── Color math ────────────────────────────────────────────────────────────────

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = n => {
    const k = (n + h / 30) % 12
    return Math.round(255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)))
      .toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function relativeLuminance(r, g, b) {
  return [r, g, b].reduce((sum, c, i) => {
    c /= 255
    const linear = c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    return sum + linear * [0.2126, 0.7152, 0.0722][i]
  }, 0)
}

/**
 * From a palette of [r,g,b] arrays, pick the most visually useful
 * brand color — prefers saturated, mid-range lightness, avoids
 * near-white / near-black / near-gray.
 */
function pickBestColor(palette) {
  let best = null, bestScore = -1
  for (const [r, g, b] of palette) {
    const [, s, l] = rgbToHsl(r, g, b)
    if (s < 20 || l < 12 || l > 82) continue   // skip achromatic / extreme
    const score = s * 0.6 + (50 - Math.abs(l - 45)) * 0.4
    if (score > bestScore) { bestScore = score; best = [r, g, b] }
  }
  return best ?? palette[0]
}

/**
 * Build a full theme object from one dominant [r,g,b] colour.
 * Clamps lightness into a range that works well against the dark UI.
 */
function buildTheme([r, g, b]) {
  const [h, s, l] = rgbToHsl(r, g, b)
  const sat = Math.max(s, 45)          // ensure enough saturation
  const base = Math.max(40, Math.min(62, l))   // usable lightness band

  return {
    accent:       hslToHex(h, sat, base),
    accentDark:   hslToHex(h, sat, Math.max(base - 22, 18)),
    accentLight:  hslToHex(h, sat, Math.min(base + 20, 80)),
    accentFaded:  `rgba(${r},${g},${b},0.18)`,
    accentBorder: `rgba(${r},${g},${b},0.55)`,
    onAccent:     relativeLuminance(r, g, b) > 0.35 ? '#111827' : '#ffffff',
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Pass an <img> element (with crossOrigin="anonymous") via onImageLoad.
 * Returns { theme, onImageLoad }.
 * theme is null until an image is successfully processed.
 */
export function useTheme() {
  const [theme, setTheme] = useState(null)

  const onImageLoad = useCallback(async (img) => {
    if (!img) return
    try {
      const { default: ColorThief } = await import('colorthief')
      const palette = new ColorThief().getPalette(img, 8)
      setTheme(buildTheme(pickBestColor(palette)))
    } catch (err) {
      // CORS block or canvas taint — silently fall back to default blue
      console.warn('Theme extraction skipped:', err.message)
    }
  }, [])

  /**
   * CSS custom properties to spread onto the root element's style.
   * Falls back to blue (#2563eb) when theme is null so the app
   * always looks correct even without a logo.
   */
  const cssVars = theme ? {
    '--accent':        theme.accent,
    '--accent-dark':   theme.accentDark,
    '--accent-light':  theme.accentLight,
    '--accent-faded':  theme.accentFaded,
    '--accent-border': theme.accentBorder,
    '--on-accent':     theme.onAccent,
  } : {}

  return { theme, cssVars, onImageLoad }
}
