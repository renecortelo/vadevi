/** Whether the reader's system welcomes motion; no answer is taken as no. */
export function motionWelcome(): boolean {
  return globalThis.matchMedia?.("(prefers-reduced-motion: no-preference)").matches === true;
}
