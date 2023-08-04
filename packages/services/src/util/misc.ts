
export function parseIntOrElse(s: string, fallback: number): number {
  try {
    return Number.parseInt(s);
  }
  catch {
    return fallback;
  }
}

export function decodeField<T>(
  test: (x: unknown) => x is T,
  field: string,
): (args: Record<string, any>) => T | undefined {
  function decoder(obj: Record<string, any>): T | undefined {
    if (!(field in obj)) return;
    if (!test(obj[field])) return;
    return obj[field];
  }
  return decoder;
}
