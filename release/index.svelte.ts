import { type Expand, supportsHistory } from "./utils";
import { type Config as DebounceConfig, MappedDebouncer } from "./debounce";

type UpdateHistoryBehavior = "push" | "replace";
type EntryBehavior = "multiple" | "single";

type SingularVerboseParameterHandler<T> = Expand<{
  /**
   * The query parameter key to use in the URL.
   *
   * If not provided, the property name from the target object will be used.
   * The key will be URI-encoded before being added to the URL.
   */
  key?: string;
  /**
   * Determines how URL updates affect browser history.
   *
   * - `"push"`: Creates a new history entry (allows back/forward navigation)
   * - `"replace"`: Replaces the current history entry (no new history entry)
   *
   * @default "push"
   */
  history?: UpdateHistoryBehavior;
  /**
   * Specifies whether this parameter allows single or multiple values.
   *
   * For singular handlers, this must be `"single"` (or omitted).
   *
   * @default "single"
   */
  entries?: Extract<EntryBehavior, "single">;
  /**
   * Configures debouncing behavior for URL parameter updates.
   *
   * - `false`: Disables debouncing for this parameter (even if global debounce is configured)
   * - `DebounceConfig`: Custom debounce settings for this parameter
   * - `null`: Uses the global debounce configuration (if any)
   *
   * @default null
   */
  debounce?: false | DebounceConfig | null;
  /**
   * Transforms the deserialized query parameter value into the final application type.
   *
   * This function is called after both decoding and deserializing the URL parameter.
   *
   * @param query The intermediate representation of the query parameter value (e.g., a JavaScript object)
   * @returns The resolved value of type T for use in the application
   */
  resolve: (query: unknown) => T;
  /**
   * Converts the application value into a string for URL storage.
   *
   * This function is called before encoding the value for the URL.
   *
   * @param value The application value to serialize
   * @returns The serialized string representation
   * @default JSON.stringify
   */
  serialize?: (value: T) => string;
  /**
   * Parses the query parameter string from the URL into an intermediate representation.
   *
   * This function is called after decoding the URL parameter and before resolving it.
   *
   * @param query The query parameter string from the URL
   * @returns The intermediate representation (e.g., a JavaScript object)
   * @default JSON.parse (with undefined handling)
   */
  deserialize?: (query: string) => unknown;
  /**
   * Decodes a URL-encoded parameter string.
   *
   * This function is called first when reading from the URL, before deserializing.
   *
   * @param serialized The encoded string from the URL
   * @returns The decoded string
   * @default decodeURIComponent
   */
  decode?: (serialized: string) => string;
  /**
   * Encodes a serialized string for safe storage in the URL.
   *
   * This function is called last when writing to the URL, after serializing.
   *
   * @param serialized The serialized string to encode
   * @returns The URL-safe encoded string
   * @default encodeURIComponent
   */
  encode?: (serialized: string) => string;
}>;

/**
 * Default configuration values for URL parameter handlers.
 *
 * These defaults are applied to any parameter handler that doesn't explicitly
 * specify a value for a particular option. You can override these on a per-parameter
 * basis or globally via the URLParameterize options.
 */
export const defaults = {
  /** Default history behavior: creates new history entries for URL changes */
  history: "push",
  /** Default entry behavior: single value per parameter */
  entries: "single",
  /** Default debounce behavior: no debouncing (null means use global config if set) */
  debounce: null,
  /** Default encoder: uses standard URI component encoding */
  encode: (serialized) => encodeURIComponent(serialized),
  /** Default decoder: uses standard URI component decoding */
  decode: (serialized) => decodeURIComponent(serialized),
  /** Default deserializer: parses JSON, handling the special case of "undefined" string */
  deserialize: (query) =>
    query !== "undefined" ? JSON.parse(query) : undefined,
  /** Default serializer: converts values to JSON strings */
  serialize: (value) => JSON.stringify(value),
} as const satisfies Pick<
  SingularVerboseParameterHandler<any>,
  | "encode"
  | "decode"
  | "deserialize"
  | "serialize"
  | "history"
  | "entries"
  | "debounce"
>;

type Default<K extends keyof typeof defaults> = (typeof defaults)[K];

type MultipleVerboseParameterHandler<T extends any[]> = Expand<
  Omit<SingularVerboseParameterHandler<T[number]>, "entries"> & {
    /**
     * Specifies that this parameter allows multiple values.
     *
     * When set to `"multiple"`, the parameter can accept an array of values
     * and will handle multiple query parameter entries with the same key.
     *
     * @example URL with multiple entries: `?tag=js&tag=ts&tag=svelte`
     */
    entries: Extract<EntryBehavior, "multiple">;
  }
>;

type VerboseParameterHandler<T> = T extends any[]
  ? SingularVerboseParameterHandler<T> | MultipleVerboseParameterHandler<T>
  : SingularVerboseParameterHandler<T>;

export type ParameterHandler<T> =
  | SingularVerboseParameterHandler<T>["resolve"]
  | VerboseParameterHandler<T>;

export type ParameterHandlers<T> = {
  [k in keyof T & string]: ParameterHandler<T[k]>;
};

type ResolvedParameterHandler<T> = Required<VerboseParameterHandler<T>>;
type AnyParameterHandler = ResolvedParameterHandler<any | any[]>;

const verbosify = <T>(
  handler: ParameterHandler<T>,
  key: string,
  options?: Options
): ResolvedParameterHandler<T> =>
  typeof handler === "function"
    ? verbosify(
        {
          resolve: handler,
        } satisfies SingularVerboseParameterHandler<T> as VerboseParameterHandler<T>,
        key,
        options
      )
    : ({
        resolve: handler.resolve,
        key: encodeURIComponent((options?.prefix ?? "") + (handler.key ?? key)),
        entries: (handler.entries ?? defaults.entries) as Default<"entries">,
        debounce: handler.debounce ?? defaults.debounce,
        history: handler.history ?? options?.history ?? defaults.history,
        deserialize:
          handler.deserialize ?? options?.deserialize ?? defaults.deserialize,
        serialize:
          handler.serialize ?? options?.serialize ?? defaults.serialize,
        encode: handler.encode ?? options?.encode ?? defaults.encode,
        decode: handler.decode ?? options?.decode ?? defaults.decode,
      } satisfies Required<
        SingularVerboseParameterHandler<T>
      > as ResolvedParameterHandler<T>);

const supportsMultiple = (
  handler: AnyParameterHandler
): handler is Required<MultipleVerboseParameterHandler<any[]>> =>
  handler.entries === "multiple";

type URLState = Map<string, string | string[]>;

const getURLState = () => {
  const state: URLState = new Map();
  new URL(window.location.href).searchParams.forEach((value, key) => {
    if (!state.has(key)) return state.set(key, value);
    const existing = state.get(key)!;
    if (Array.isArray(existing)) existing.push(value);
    else state.set(key, [existing, value]);
  });
  return state;
};

const URLChangeEvent = {
  key: "urlchange",

  emit: () =>
    window.dispatchEvent(
      new CustomEvent(URLChangeEvent.key, { detail: getURLState() })
    ),

  stateFromEvent: (event: Event) => {
    if (!(event instanceof CustomEvent))
      return console.error("Not a CustomEvent");
    if (!(event.detail instanceof Map))
      return console.error("Event detail is not a Map");
    return event.detail as URLState;
  },

  setupComplete: false,

  setupListener: (): boolean => {
    if (URLChangeEvent.setupComplete) return true;
    if (!supportsHistory) return false;

    const { pushState, replaceState } = history;

    history.pushState = function (...args) {
      console.log("Pushing state", args);
      pushState.apply(this, args);
      URLChangeEvent.emit();
    };

    history.replaceState = function (...args) {
      replaceState.apply(this, args);
      URLChangeEvent.emit();
    };

    window.addEventListener("popstate", URLChangeEvent.emit);

    return (URLChangeEvent.setupComplete = true);
  },

  trigger: (
    value: string[] | string | undefined,
    { key, history }: AnyParameterHandler
  ) => {
    if (!URLChangeEvent.setupListener()) return;

    const url = new URL(window.location.href);

    if (value === undefined) url.searchParams.delete(key);
    else if (Array.isArray(value)) {
      url.searchParams.delete(key);
      value.forEach((v) => url.searchParams.append(key, v));
    } else url.searchParams.set(key, value);

    window.history[`${history}State`]({}, "", url);
  },
};

const cachify = (param: string, ...values: string[]) =>
  new URLSearchParams(values.map((v) => [param, v])).toString();

const evaluate = (
  { decode, deserialize, resolve }: ResolvedParameterHandler<any | any[]>,
  value: string
) => resolve(deserialize(decode(value)));

const urlify = (
  { encode, serialize }: ResolvedParameterHandler<any | any[]>,
  value: any
) => encode(serialize(value));

const keysInUse = new Set<string>();

const checkForKeyConflict = ({ key }: AnyParameterHandler) => {
  if (keysInUse.has(key))
    throw new Error(`URL parameter key conflict detected: "${key}"`);
  keysInUse.add(key);
};

const debouncer = new MappedDebouncer<string>({ idleMs: -1, maxWaitMs: -1 });

export type Options = Partial<
  {
    prefix: string;
    cleanup: (callback: () => void) => void;
    debounce: DebounceConfig;
  } & Pick<
    SingularVerboseParameterHandler<any>,
    "history" | "encode" | "decode" | "deserialize" | "serialize"
  >
>;

/**
 * Synchronizes an object's properties with URL query parameters.
 *
 * This function establishes a bidirectional binding between the properties of a target object
 * and URL query parameters. Changes to the object properties automatically update the URL,
 * and changes to the URL (e.g., browser back/forward, manual edits) update the object.
 *
 * @template T The type of the target object to synchronize
 * @param target The object whose properties will be synchronized with URL parameters
 * @param handlers Configuration for each property, defining how values are converted to/from URL strings
 * @param options Optional global configuration (prefix, cleanup callback, debounce settings)
 * @returns A cleanup function to dispose of the synchronization and remove event listeners
 *
 * @example
 * ```ts
 * class Model {
 *   search = $state('');
 *   page = $state(1);
 *
 *   readonly disposeURLTracking = URLParameterize<Model>(this, {
 *     search: (query) => String(query ?? ''),
 *     page: (query) => Number(query ?? 1)
 *   });
 * }
 * ```
 */
export const URLParameterize = <T>(
  target: T,
  handlers: Partial<ParameterHandlers<T>>,
  options?: Options
) => {
  if (!URLChangeEvent.setupListener())
    return () => {
      console.error("History API not supported; URLParameterize disabled");
    };

  type Key = keyof T & string;

  const cache = new Map<Key, string>();
  const handlerByKey = new Map<Key, AnyParameterHandler>();
  const paramByKey = new Map<Key, string>();

  const trySetURL = (key: Key, value: any, handler: AnyParameterHandler) => {
    const query = urlify.bind(null, handler);

    const isMultiple = handler.entries === "multiple" && Array.isArray(value);
    const urlified = isMultiple ? value.map(query) : query(value);

    const cached = Array.isArray(urlified)
      ? cachify(handler.key, ...urlified)
      : cachify(handler.key, urlified);

    if (cache.get(key) !== cached) {
      cache.set(key, cached);
      URLChangeEvent.trigger(urlified, handler);
    }
  };

  const setFromURL = (state: URLState, param: string, key: Key) => {
    if (!state.has(param)) {
      cache.delete(key);
      if (Array.isArray(target[key])) target[key].length = 0;
      return;
    }

    const handler = handlerByKey.get(key)!;
    const stored = state.get(param)!;
    const isArray = Array.isArray(stored);
    const isMultiple = supportsMultiple(handler);

    if (isArray && !isMultiple) throw new Error("Expected multiple values");

    if (isArray || isMultiple) {
      const arr = target[key] as any[];
      const values = isArray ? stored : [stored];
      const previous = new URLSearchParams(cache.get(key)).getAll(param);

      for (let i = 0; i < values.length; i++)
        if (values[i] !== previous[i]) arr[i] = evaluate(handler, values[i]);

      arr.splice(values.length, previous.length - values.length);
      cache.set(key, cachify(param, ...values));
    } else {
      const previous = new URLSearchParams(cache.get(key)).get(param);
      if (stored === previous) return;
      target[key] = evaluate(handler, stored);
      cache.set(key, cachify(param, stored));
    }
  };

  const onURLChange = (event: Event) => {
    const state = URLChangeEvent.stateFromEvent(event);
    if (state) paramByKey.forEach(setFromURL.bind(null, state));
  };

  window.addEventListener(URLChangeEvent.key, onURLChange);

  const dispose = () => {
    cache.clear();
    handlerByKey.clear();
    for (const param of paramByKey.values()) {
      debouncer.clear(param);
      keysInUse.delete(param);
    }
    paramByKey.clear();
    window.removeEventListener(URLChangeEvent.key, onURLChange);
  };

  const effect = (key: Key, state: URLState) => {
    const handler = verbosify<any>(handlers[key]!, key, options);

    checkForKeyConflict(handler);

    const param = handler.key;
    const debounce =
      handler.debounce === false
        ? undefined
        : handler.debounce ?? options?.debounce;

    handlerByKey.set(key, handler);
    paramByKey.set(key, param);

    setFromURL(state, param, key);

    const update = () => trySetURL(key, target[key], handler);

    $effect(() => {
      if (!debounce) return update();
      $state.snapshot(target[key]); // track deeply
      debouncer.enqueue(param, update, debounce);
    });
  };

  const cleanup = $effect.root(() => {
    const state = getURLState();
    for (const key in handlers) effect(key as Key, state);
    return dispose;
  });

  options?.cleanup?.(cleanup);

  return cleanup;
};
