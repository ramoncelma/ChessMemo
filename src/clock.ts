// Module-level clock that the rest of the app uses anywhere "now" needs to
// honour Vacation Mode. When vacation is on, "now" is frozen at the moment
// vacation started — so lines that were due before that stay due, and any
// review that would have come up during vacation is hidden until vacation ends.
//
// useSettings keeps this in sync with the stored settings on every change.

let vacationStartedAt: number | null = null;

export function setVacationStart(t: number | null) {
  vacationStartedAt = t;
}

export function nowSrs(): number {
  return vacationStartedAt ?? Date.now();
}

export function getVacationStart(): number | null {
  return vacationStartedAt;
}
