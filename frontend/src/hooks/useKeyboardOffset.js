import { useEffect, useState } from "react"

// Tracks how much of the layout viewport is currently covered by the
// on-screen keyboard, using the visualViewport API (the same trick browsers'
// own "scroll input into view" behavior relies on). Returns 0 when no
// keyboard is showing (or the API isn't supported).
export function useKeyboardOffset() {
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop
      setOffset(Math.max(0, Math.round(covered)))
    }

    update()
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)
    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
    }
  }, [])

  return offset
}

// A small threshold (rather than > 0) avoids false positives from browser
// chrome (address bar collapsing on scroll, etc.) which can shift the visual
// viewport by a few tens of pixels without a keyboard involved.
const KEYBOARD_THRESHOLD = 100

export function useKeyboardOpen() {
  return useKeyboardOffset() >= KEYBOARD_THRESHOLD
}
