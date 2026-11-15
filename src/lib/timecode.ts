/**
 * Formats seconds as a timecode: `mm:ss` under an hour, `h:mm:ss` above.
 * Used for every timestamp in the UI and in user-facing errors.
 */
export function formatTimecode(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const ss = String(seconds).padStart(2, "0");

  if (hours) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
  }
  return `${String(minutes).padStart(2, "0")}:${ss}`;
}

/**
 * Parses `90`, `1:30` or `1:02:03` into whole seconds.
 * Returns `undefined` for an empty string and `NaN` for anything invalid.
 */
export function parseTimecode(input: string): number | undefined {
  const value = input.trim();
  if (!value) {
    return undefined;
  }
  if (!/^\d+(:\d{1,2}){0,2}$/.test(value)) {
    return Number.NaN;
  }

  const parts = value.split(":").map(Number);
  if (parts.slice(1).some((part) => part >= 60)) {
    return Number.NaN;
  }
  return parts.reduce((total, part) => total * 60 + part, 0);
}
