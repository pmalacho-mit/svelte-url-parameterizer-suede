export const isBrowser = typeof window !== "undefined";

/**
 * Detects whether the current environment supports the History API.
 */
export const supportsHistory =
  isBrowser &&
  typeof history !== "undefined" &&
  typeof history.pushState === "function" &&
  typeof history.replaceState === "function";

export type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

export type ExpandRecursively<T> = T extends object
  ? T extends infer O
    ? { [K in keyof O]: ExpandRecursively<O[K]> }
    : never
  : T;
