/** Minutes since midnight for the build-up to lunch and dinner rush. */
export const PRE_RUSH_WINDOWS = [
  { start: 11 * 60 + 30, end: 13 * 60 + 30 }, // lunch build-up
  { start: 18 * 60 + 30, end: 21 * 60 },      // dinner build-up
];

export function isPreRushNow(d: Date): boolean {
  const m = d.getHours() * 60 + d.getMinutes();
  return PRE_RUSH_WINDOWS.some(w => m >= w.start && m < w.end);
}
