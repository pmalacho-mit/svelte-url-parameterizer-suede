# URLParameterize

Bidirectional binding between Svelte 5 `$state` properties and URL query parameters. Mutating a tracked property updates the URL; browser navigation, manual edits, or `pushState`/`replaceState` from elsewhere flow back into the state.

Built on Svelte 5 runes — call sites must live inside a rune-aware context (component script, `.svelte.ts` module, or `$effect.root`).

## Basic usage

```ts
import { URLParameterize } from "...";

class Model {
  search = $state("");
  page = $state(1);

  readonly url = URLParameterize<Model>(this, {
    search: (query) => String(query ?? ""),
    page: (query) => Number(query ?? 1),
  });
}
```

`URLParameterize(target, handlers, options?)` returns `{ cleanup, prefix }`. Call `cleanup()` on destroy to tear down listeners and remove the parameters from the URL.

```ts
import { onDestroy } from "svelte";

onDestroy(model.url.cleanup);
```

Or hand `onDestroy` to the utility via options and skip the manual wiring:

```ts
URLParameterize(this, handlers, { onDestroy });
```

## Handlers

Each handler is either a **resolve function** or a **verbose config object**.

### Resolve function (shorthand)

```ts
{
  page: (query, param, index) => Number(query ?? 1)
}
```

- `query` — the value after `decode` + `deserialize` (defaults to `JSON.parse` of the decoded URL string, or `undefined` if missing).
- `param` — the fully-qualified URL key (with prefix applied).
- `index` — the position within a `"multiple"`-entry array, otherwise `undefined`.

The function's job is to **coerce/validate** the unknown query value into the target property's type. Always provide a fallback for the `undefined` / wrong-shape case.

### Verbose handler

```ts
{
  search: {
    resolve: (query) => typeof query === "string" ? query : "",
    serialize: (value) => value,            // default: JSON.stringify
    deserialize: (query) => query,          // default: JSON.parse (with "undefined" handling)
    encode: encodeURIComponent,             // default
    decode: decodeURIComponent,             // default
    key: "q",                               // default: property name
    history: "replace",                     // "push" (default) | "replace"
    entries: "single",                      // "single" (default) | "multiple"
    debounce: { idleMs: 250, maxWaitMs: 1000 },
    previousKeys: [{ fullname: "query", remove: true }],
  }
}
```

#### Pipeline

Writing to the URL: `value → serialize → encode → URL`
Reading from the URL: `URL → decode → deserialize → resolve → property`

#### Field reference

| Field | Purpose |
|---|---|
| `resolve` | **Required.** Coerces the deserialized query into the property type. |
| `serialize` | Value → string. Default `JSON.stringify`. |
| `deserialize` | String → intermediate value. Default `JSON.parse` (with `"undefined"` → `undefined`). |
| `encode` / `decode` | URL-safety. Defaults to `encodeURIComponent` / `decodeURIComponent`. |
| `key` | Override the URL parameter name (otherwise uses the property name). |
| `history` | `"push"` creates a back-button entry per change; `"replace"` does not. |
| `entries` | `"single"` (default) or `"multiple"` — see below. |
| `debounce` | `false` disables; `{ idleMs, maxWaitMs }` overrides; `null` falls back to the global option. |
| `previousKeys` | Migration from older URL key names — see below. |

### Multiple-entry parameters (arrays)

Set `entries: "multiple"` for properties that map to repeated query keys like `?tag=js&tag=ts`:

```ts
tags: {
  entries: "multiple",
  resolve: (query, _param, index) => String(query),
}
```

The property must be an array. `serialize`/`encode` are applied per element. `resolve` is called once per entry, with `index` set.

## Options

Second-tier defaults applied to every handler in the call:

```ts
URLParameterize(this, handlers, {
  prefix: () => "app_",          // string | () => string. Prepended to every key.
  onDestroy,                     // Svelte's onDestroy — auto-wires cleanup.
  debounce: { idleMs: 200, maxWaitMs: 800 },
  history: "replace",
  encode, decode, serialize, deserialize,
});
```

### Reactive prefix

When `prefix` is a function, it is tracked reactively. Changing what the getter returns moves every parameter to the new prefix (using `replace`-history), preserving values. This is the supported way to scope multiple instances of the same model — e.g. one instance per array index.

You can also imperatively trigger a prefix change:

```ts
const { prefix } = URLParameterize(this, handlers);
prefix("v2_");
```

## Debouncing

URL writes can be coalesced per-parameter:

- `idleMs` — flush this many ms after the last mutation.
- `maxWaitMs` — hard upper bound; force-flush even if mutations keep arriving. Must be `≥ idleMs`.

Pending writes are flushed on `visibilitychange`, `pagehide`, and `beforeunload`, so navigation never drops state.

Per-handler `debounce` overrides the global option. Set `debounce: false` on a handler to opt out when a global is configured.

## Legacy key migration (`previousKeys`)

Used when renaming a URL parameter without breaking links already in the wild:

```ts
{
  hello: {
    resolve: (q) => typeof q === "string" ? q : "hi",
    previousKeys: [
      { fullname: "greeting", apply: true, remove: true, behavior: "replace" },
    ],
  }
}
```

On mount, for each entry:
- `apply` (default `true`) — if the old key is present, read its value into the property.
- `remove` (default `true`) — strip the old key from the URL.
- `behavior` (default `"replace"`) — history mode used to strip.

`fullname` is matched verbatim (no prefix is prepended).

## Defaults

The defaults applied to omitted fields are exported for inspection or composition:

```ts
import { defaults } from "...";
// { history, entries, debounce, encode, decode, serialize, deserialize, previousKeys }
```

## TypeScript

The `URLParameterize` namespace re-exports the relevant types:

```ts
import type { URLParameterize as UP } from "...";

const handlers: UP.Handlers<Model> = { /* ... */ };
const options: UP.Options = { /* ... */ };
const ret: UP.Return = model.url;
```

## Caveats

- Requires a browser environment with the History API. In SSR or unsupported environments the utility no-ops and logs an error; the returned `cleanup`/`prefix` functions are safe to call.
- Every tracked property must have a unique fully-qualified key (prefix + key). Conflicting registrations throw on mount — use distinct `key` overrides or distinct prefixes.
- Handlers run on every URL change for every tracked parameter, so keep them cheap. The utility caches the last-seen serialized form per parameter and skips no-op updates in both directions.
