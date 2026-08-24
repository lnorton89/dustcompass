/**
 * A short buzz to confirm something happened, for the times the screen is not
 * being looked at — saving where the bike is while walking away from it, or
 * arriving somewhere with the phone still in a pocket.
 *
 * `vibrate` is absent on desktop Safari and iOS entirely, and present but
 * gated behind user activation on Android. All three are fine: this is
 * confirmation on top of a visible change, never the only signal that
 * something worked.
 */
type Pattern = 'confirm' | 'arrive'

const PATTERNS: Record<Pattern, number | number[]> = {
  /** One tap: saved, removed, restored. */
  confirm: 18,
  /** Two, so it is distinguishable through a pocket. */
  arrive: [24, 70, 24],
}

export function haptic(pattern: Pattern) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(PATTERNS[pattern])
  } catch {
    // Some browsers expose `vibrate` and throw on use inside an iframe or
    // without a user gesture. There is nothing to recover — the visible
    // confirmation has already happened.
  }
}
