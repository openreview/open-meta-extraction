
export function parseIntOrElse(s: string, fallback: number): number {
  try {
    return Number.parseInt(s);
  }
  catch {
    return fallback;
  }
}
