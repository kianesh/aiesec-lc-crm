export type Result<T, E extends Error = Error> =
  | { ok: true; data: T }
  | { ok: false; error: E };
