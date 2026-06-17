// The only JSON escape hatch in the app. Callers must validate returned values
// before treating them as protocol data.
export function parseJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}
