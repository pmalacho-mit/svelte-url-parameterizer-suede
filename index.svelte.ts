import { type Expand, supportsHistory } from "./utils";

export type Resolve<T> = (query: unknown) => T;
type UpdateHistoryBehavior = "push" | "replace";
type ArrayBehavior = "multiple" | "single";
type WithArrayBehavior<T extends ArrayBehavior> = { entries: T };

type SingularVerboseParameterHandler<T> = Expand<
  {
    /**
     * Function to resolve the query parameter value(s) from the URL into the desired type.
     *
     * Runs after parsing and decoding.
     */
    resolve: Resolve<T>;
    /**
     * Function to serialize the value into a string for URL storage.
     *
     * Runs before encoding.
     *
     * @param value The value to serialize
     * @returns The serialized string
     */
    serialize?: (value: T) => string;
    /**
     * Function to parse the query parameter string from the URL into an intermediate representation
     * (e.g. some javascript object) before being passed to `resolve`.
     * @param query
     * @returns
     */
    deserialize?: (query: string) => unknown;
    /**
     * Function to decode the serialized string from the URL.
     * @param serialized
     * @returns
     */
    decode?: (serialized: string) => string;
    /**
     * Function to encode the serialized string for storage in the URL.
     * @param serialized
     * @returns
     */
    encode?: (serialized: string) => string;
    key?: string;
    history?: UpdateHistoryBehavior;
  } & Partial<WithArrayBehavior<"single">>
>;

const defaults = {
  encode: (serialized) => encodeURIComponent(serialized),
  decode: (serialized) => decodeURIComponent(serialized),
  deserialize: (query) => JSON.parse(query),
  serialize: (value) => JSON.stringify(value),
  history: "push",
  entries: "single",
} as const satisfies Pick<
  SingularVerboseParameterHandler<any>,
  "encode" | "decode" | "deserialize" | "serialize" | "history" | "entries"
>;

type MultipleVerboseParameterHandler<T extends any[]> = Expand<
  Omit<
    SingularVerboseParameterHandler<T[number]>,
    keyof WithArrayBehavior<any>
  > &
    WithArrayBehavior<"multiple">
>;

type VerboseParameterHandler<T> = T extends any[]
  ? SingularVerboseParameterHandler<T> | MultipleVerboseParameterHandler<T>
  : SingularVerboseParameterHandler<T>;

export type ParameterHandler<T> = Resolve<T> | VerboseParameterHandler<T>;
export type ParameterHandlers<T> = {
  [k in keyof T & string]: ParameterHandler<T[k]>;
};

type ResolvedParameterHandler<T> = Required<VerboseParameterHandler<T>>;

const verbosify = <T>(handler: ParameterHandler<T>, key: string) =>
  typeof handler === "function"
    ? ({
        key: encodeURIComponent(key),
        resolve: handler,
        deserialize: defaults.deserialize,
        serialize: defaults.serialize,
        encode: defaults.encode,
        decode: defaults.decode,
        history: "push",
        entries: "single",
      } satisfies Required<
        SingularVerboseParameterHandler<T>
      > as ResolvedParameterHandler<T>)
    : ({
        key: encodeURIComponent(handler.key ?? key),
        resolve: handler.resolve,
        deserialize: handler.deserialize ?? defaults.deserialize,
        serialize: handler.serialize ?? defaults.serialize,
        encode: handler.encode ?? defaults.encode,
        decode: handler.decode ?? defaults.decode,
        history: handler.history ?? defaults.history,
        entries: (handler.entries ??
          defaults.entries) as typeof defaults.entries,
      } satisfies Required<
        SingularVerboseParameterHandler<T>
      > as ResolvedParameterHandler<T>);

const supportsMultiple = (
  handler:
    | Required<SingularVerboseParameterHandler<any>>
    | Required<MultipleVerboseParameterHandler<any[]>>
): handler is Required<MultipleVerboseParameterHandler<any[]>> =>
  (handler.entries as ArrayBehavior) === "multiple";

type URLState = Map<string, string | string[]>;

const getURLState = (url: URL) => {
  const current: URLState = new Map();
  url.searchParams.forEach((value, key) => {
    if (!current.has(key)) return current.set(key, value);
    const existing = current.get(key)!;
    if (Array.isArray(existing)) existing.push(value);
    else current.set(key, [existing, value]);
  });
  return current;
};

const URLChangeEvent = {
  key: "urlchange",

  emit: () => {
    const detail = getURLState(new URL(window.location.href));
    window.dispatchEvent(new CustomEvent(URLChangeEvent.key, { detail }));
  },

  stateFromEvent: (event: Event): URLState | void => {
    if (!(event instanceof CustomEvent))
      return console.error("Not a CustomEvent");
    const { detail } = event;
    if (!(detail instanceof Map))
      return console.error("Event detail is not a Map");
    return detail as URLState;
  },

  setupComplete: false,

  setupListener: (): boolean => {
    if (URLChangeEvent.setupComplete) return true;
    if (!supportsHistory) return false;

    const { pushState, replaceState } = history;

    history.pushState = function (...args) {
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
    { key, history }: Pick<ResolvedParameterHandler<any>, "key" | "history">
  ) => {
    console.log("Triggering URL change", { key, value });
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

export const URLParameterize = <T>(
  target: T,
  handlers: Partial<ParameterHandlers<T>>,
  cleanup?: (callback: () => void) => void
) => {
  if (!URLChangeEvent.setupListener()) return;

  type AnyParameterHandler = ResolvedParameterHandler<any | any[]>;

  type Key = keyof T & string;

  const cache = new Map<Key, string>();
  const handlerByKey = new Map<Key, AnyParameterHandler>();
  const paramByKey = new Map<Key, string>();

  const drop = (key: Key, handler: AnyParameterHandler) => {
    cache.delete(key);
    URLChangeEvent.trigger(undefined, handler);
  };

  const tryUpdate = (
    key: Key,
    cacheable: string,
    values: string[] | string,
    handler: AnyParameterHandler
  ) => {
    if (cache.get(key) === cacheable) return;
    cache.set(key, cacheable);
    URLChangeEvent.trigger(values, handler);
  };

  const update = {
    single: (key: Key, value: any, handler: AnyParameterHandler) => {
      const urlified = urlify(handler, value);
      const cached = cachify(handler.key, urlified);
      tryUpdate(key, cached, urlified, handler);
    },
    multiple: (
      key: Key,
      values: any[],
      handler: Required<MultipleVerboseParameterHandler<any>>
    ) => {
      const urlifiedValues = values.map((v) => urlify(handler, v));
      const cached = cachify(handler.key, ...urlifiedValues);
      tryUpdate(key, cached, urlifiedValues, handler);
    },
  };

  const setValueFromURLState = (state: URLState, key: Key, param: string) => {
    let values = state.get(param);
    if (values === undefined) return;

    const handler = handlerByKey.get(key)!;

    values =
      handler.entries === "multiple" && !Array.isArray(values)
        ? [values]
        : values;

    if (Array.isArray(values)) {
      if (!supportsMultiple(handler))
        throw new Error("Expected singular value");

      const previous = cache.has(key)
        ? new URLSearchParams(cache.get(key)!).getAll(param)
        : [];

      const array = target[key as Key] as any[];

      for (let i = 0; i < values.length; i++)
        if (values[i] !== previous[i]) array[i] = evaluate(handler, values[i]);

      array.splice(values.length, previous.length - values.length);
      cache.set(key, cachify(param, ...values));
    } else {
      const previous = cache.has(key)
        ? new URLSearchParams(cache.get(key)!).get(param)
        : undefined;
      if (values === previous) return;
      target[key as Key] = evaluate(handler, values) as T[Key];
      cache.set(key, cachify(param, values));
    }
  };

  const onURLChange = (event: Event) => {
    const state = URLChangeEvent.stateFromEvent(event);
    if (!state) return;
    paramByKey.forEach((paramKey, key) =>
      setValueFromURLState(state, key, paramKey)
    );
  };

  window.addEventListener(URLChangeEvent.key, onURLChange);
  cleanup?.(() => window.removeEventListener(URLChangeEvent.key, onURLChange));

  const state = getURLState(new URL(window.location.href));

  for (const k in handlers) {
    const key = k as Key;

    if (!handlers[key]) continue;
    const handler = verbosify<any>(handlers[key]!, key);

    handlerByKey.set(key, handler);
    paramByKey.set(key, handler.key);

    setValueFromURLState(state, key, handler.key);

    $effect(() => {
      const value = target[key];
      switch (handler.entries) {
        case "single": {
          const remove =
            value === undefined || (Array.isArray(value) && value.length === 0);
          if (remove) {
            if (cache.has(key)) drop(key, handler);
          } else update.single(key, value, handler);
          break;
        }
        case "multiple": {
          if (value === undefined) {
            if (cache.has(key)) drop(key, handler);
          } else if (Array.isArray(value)) update.multiple(key, value, handler);
          else throw new Error("Expected array value");
          break;
        }
      }
    });
  }
};
