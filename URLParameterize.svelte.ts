import {
  type Expand,
  type MaybeGetter,
  supportsHistory,
  resolve,
} from "./utils";
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
  resolve: (query: unknown, param: string, index: number | undefined) => T;
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

  previousKeys?:
    | {
        fullname: string;
        remove?: boolean;
        apply?: boolean;
        behavior?: UpdateHistoryBehavior;
      }[]
    | null;
}>;

export type Options = Partial<
  {
    prefix: MaybeGetter<string>;
    onDestroy: (callback: () => void) => void;
    debounce: DebounceConfig;
  } & Pick<
    SingularVerboseParameterHandler<any>,
    "history" | "encode" | "decode" | "deserialize" | "serialize"
  >
>;

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
  previousKeys: null,
} as const satisfies Pick<
  SingularVerboseParameterHandler<any>,
  | "encode"
  | "decode"
  | "deserialize"
  | "serialize"
  | "history"
  | "entries"
  | "debounce"
  | "previousKeys"
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

const validParam = (key: string) => encodeURIComponent(key);

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
        key: validParam(resolve(options?.prefix, "") + (handler.key ?? key)),
        entries: (handler.entries ?? defaults.entries) as Default<"entries">,
        debounce: handler.debounce ?? defaults.debounce,
        previousKeys: handler.previousKeys ?? defaults.previousKeys,
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

const cachify = (param: string, ...values: string[]) =>
  new URLSearchParams(values.map((v) => [param, v])).toString();

const evaluate = (
  { decode, deserialize, resolve }: ResolvedParameterHandler<any | any[]>,
  value: string,
  param: string,
  index: number | undefined = undefined
) => resolve(deserialize(decode(value)), param, index);

const serialize = (value: any, { serialize, entries }: AnyParameterHandler) =>
  entries === "multiple" && Array.isArray(value)
    ? value.map(serialize)
    : serialize(value);

const encode = (serialized: any, { entries, encode }: AnyParameterHandler) =>
  entries === "multiple" && Array.isArray(serialized)
    ? serialized.map(encode)
    : encode(serialized);

const parameterize = (value: any, handler: AnyParameterHandler) =>
  encode(serialize(value, handler), handler);

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

  modifySearchParam: (
    param: string,
    value: string[] | string | undefined,
    url?: URL
  ) => {
    url ??= new URL(window.location.href);
    const { searchParams } = url;

    if (value === undefined) searchParams.delete(param);
    else if (Array.isArray(value)) {
      searchParams.delete(param);
      value.forEach(searchParams.append.bind(searchParams, param));
    } else searchParams.set(param, value);

    return url;
  },

  commit: (url: URL, behavior: UpdateHistoryBehavior) => {
    if (!URLChangeEvent.setupListener()) return;
    window.history[`${behavior}State`]({}, "", url);
  },

  trigger: (
    param: string,
    value: string[] | string | undefined,
    behavior: UpdateHistoryBehavior
  ) =>
    URLChangeEvent.commit(
      URLChangeEvent.modifySearchParam(param, value),
      behavior
    ),

  batchTrigger: (
    values: { param: string; value: string[] | string | undefined }[],
    behavior: UpdateHistoryBehavior
  ) => {
    const url = new URL(window.location.href);
    for (const { param, value } of values)
      URLChangeEvent.modifySearchParam(param, value, url);
    URLChangeEvent.commit(url, behavior);
  },
};

const globals = {
  debouncer: new MappedDebouncer<string>({ idleMs: -1, maxWaitMs: -1 }),
  debounce: (param: string, callback: () => void, config: DebounceConfig) =>
    globals.debouncer.enqueue(param, callback, config),
  handlerByParam: new Map<string, AnyParameterHandler>(),
  safeSetHandler: (handler: AnyParameterHandler) => {
    if (globals.handlerByParam.has(handler.key))
      throw new Error(`URL parameter key conflict detected: "${handler.key}"`);
    globals.handlerByParam.set(handler.key, handler);
  },
  unsafeSetHandler: (handler: AnyParameterHandler) => {
    globals.handlerByParam.set(handler.key, handler);
  },
  handler: (param: string) => globals.handlerByParam.get(param),
  cachedByParam: new Map<string, string>(),
  cache: (param: string, value: string) =>
    globals.cachedByParam.set(param, value),
  cached: (param: string) => globals.cachedByParam.get(param),

  trySetFromURL: <T>(
    state: URLState,
    target: T,
    key: keyof T,
    param: string,
    handler?: AnyParameterHandler,
    doCache = true
  ) => {
    if (!state.has(param)) {
      globals.cachedByParam.delete(param);
      if (Array.isArray(target[key])) target[key].length = 0;
      return;
    }

    const current = state.get(param)!;
    const isArray = Array.isArray(current);
    handler ??= globals.handlerByParam.get(param)!;
    const isMultiple = supportsMultiple(handler);

    if (isArray && !isMultiple) throw new Error("Expected multiple values");

    if (isArray || isMultiple) {
      const arr = target[key] as any[];
      const values = isArray ? current : [current];
      const previous = new URLSearchParams(globals.cached(param)).getAll(param);

      for (let index = 0; index < values.length; index++)
        if (values[index] !== previous[index])
          arr[index] = evaluate(handler, values[index], param, index);

      arr.splice(values.length, previous.length - values.length);
      if (doCache) globals.cache(param, cachify(param, ...values));
    } else {
      const previous = new URLSearchParams(globals.cached(param)).get(param);
      if (current === previous) return;
      target[key] = evaluate(handler, current, param);
      if (doCache) globals.cache(param, cachify(param, current));
    }
  },
  trySetURLParam: (
    param: string,
    value: string | string[],
    behavior: UpdateHistoryBehavior
  ) => {
    const cached = Array.isArray(value)
      ? cachify(param, ...value)
      : cachify(param, value);

    if (globals.cached(param) !== cached) {
      globals.cache(param, cached);
      URLChangeEvent.trigger(param, value, behavior);
    }
  },
  trySetURLParams: (
    values: { param: string; value: string[] | string | undefined }[],
    behavior: UpdateHistoryBehavior
  ) => {
    URLChangeEvent.batchTrigger(
      values.filter(({ param, value }) => {
        const cached = Array.isArray(value)
          ? cachify(param, ...value)
          : cachify(param, value!);
        return globals.cached(param) !== cached
          ? (globals.cache(param, cached), true)
          : false;
      }),
      behavior
    );
  },
  delete: (param: string) => {
    globals.debouncer.clear(param);
    globals.cachedByParam.delete(param);
    globals.handlerByParam.delete(param);
    URLChangeEvent.trigger(param, undefined, "replace");
  },
};

const tryProcessHistoricalKeys = <T, Key extends keyof T>(
  target: T,
  key: Key,
  handler: AnyParameterHandler,
  state: URLState
) => {
  if (!handler.previousKeys) return;

  let replacements: string[] | undefined;
  let pushes: string[] | undefined;
  for (const {
    fullname,
    remove = true,
    apply = true,
    behavior = "replace",
  } of handler.previousKeys) {
    const param = validParam(fullname);

    if (apply) globals.trySetFromURL(state, target, key, param, handler, false);

    if (remove)
      behavior === "push"
        ? (pushes ??= []).push(param)
        : (replacements ??= []).push(param);
  }

  if (pushes)
    URLChangeEvent.batchTrigger(
      pushes.map((p) => ({ param: p, value: undefined })),
      "push"
    );
  if (replacements)
    URLChangeEvent.batchTrigger(
      replacements.map((p) => ({ param: p, value: undefined })),
      "replace"
    );
};

export type Return = {
  cleanup: () => void;
  prefix: (prefix: string) => void;
};

const errorOnUnsupported = () => {
  console.error("History API not supported; URLParameterize disabled");
};

const unsupported: Return = {
  cleanup: errorOnUnsupported,
  prefix: errorOnUnsupported,
};

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
const URLParameterize = <T>(
  target: T,
  handlers: Partial<ParameterHandlers<T>>,
  options?: Options
): Return => {
  if (!URLChangeEvent.setupListener()) return unsupported;

  type Key = keyof T & string;
  const paramByKey = new Map<Key, string>();

  const onURLChange = (event: Event) => {
    const state = URLChangeEvent.stateFromEvent(event);
    if (state)
      paramByKey.forEach((param, key) =>
        globals.trySetFromURL(state, target, key, param)
      );
  };

  window.addEventListener(URLChangeEvent.key, onURLChange);

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const param of paramByKey.values()) globals.delete(param);
    paramByKey.clear();
    window.removeEventListener(URLChangeEvent.key, onURLChange);
  };

  const setupEffect = (key: Key, state: URLState) => {
    const handler = verbosify<any>(handlers[key]!, key, options);

    globals.safeSetHandler(handler);

    const param = handler.key;
    paramByKey.set(key, param);

    const debounce =
      handler.debounce === false
        ? undefined
        : handler.debounce ?? options?.debounce;

    tryProcessHistoricalKeys(target, key, handler, state);

    globals.trySetFromURL(state, target, key, param, handler);

    const update = (serialized?: string | string[]) =>
      globals.trySetURLParam(
        param,
        serialized
          ? encode(serialized, handler)
          : parameterize(target[key], handler),
        handler.history
      );

    $effect(() => {
      const serialized = serialize(target[key], handler); // ensures tracking, even if debounced
      debounce ? globals.debounce(param, update, debounce) : update(serialized);
    });
  };

  const updatePrefix = (prefix: string) => {
    const updates: { param: string; value: string[] | string }[] = [];
    for (const [key, param] of paramByKey) {
      const handler = globals.handler(param)!;
      handler.key = validParam(prefix + key);
      globals.delete(param);
      globals.unsafeSetHandler(handler);
      paramByKey.set(key, handler.key);
      updates.push({
        param: handler.key,
        value: parameterize(target[key], handler),
      });
    }
    globals.trySetURLParams(updates, "replace");
  };

  const trySetupPrefixEffect = () => {
    if (typeof options?.prefix !== "function") return;
    const { prefix } = options;
    let previous = prefix();
    $effect(() => {
      const current = prefix();
      if (previous !== current) updatePrefix((previous = current));
    });
  };

  const cleanup = $effect.root(() => {
    const state = getURLState();
    for (const key in handlers) setupEffect(key as Key, state);
    trySetupPrefixEffect();
    return dispose;
  });

  options?.onDestroy?.(cleanup);

  return { cleanup, prefix: updatePrefix };
};

export default Object.assign(URLParameterize, defaults);
