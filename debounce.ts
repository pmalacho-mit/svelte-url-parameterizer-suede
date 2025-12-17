export type Config = { idleMs: number; maxWaitMs: number };

export class MappedDebouncer<T> {
  private maxTimers = new Map<T, number>();
  private idleTimers = new Map<T, number>();
  private callbacks = new Map<T, () => void>();
  readonly #dispose: () => void;

  constructor(private opts: Config) {
    MappedDebouncer.ValidateConfig(opts);

    const visibilityHandler = () => {
      for (const [key] of this.callbacks) this.flush(key);
    };
    window.addEventListener("visibilitychange", visibilityHandler);
    window.addEventListener("pagehide", visibilityHandler);
    window.addEventListener("beforeunload", visibilityHandler);
    this.#dispose = () => {
      window.removeEventListener("visibilitychange", visibilityHandler);
      window.removeEventListener("pagehide", visibilityHandler);
      window.removeEventListener("beforeunload", visibilityHandler);
    };
  }

  dispose() {
    this.#dispose();
  }

  clear(key: T) {
    clearTimeout(this.idleTimers.get(key));
    clearTimeout(this.maxTimers.get(key));
    this.idleTimers.delete(key);
    this.maxTimers.delete(key);
    this.callbacks.delete(key);
  }

  enqueue(key: T, callback: () => void, config?: Config) {
    if (config) MappedDebouncer.ValidateConfig(config);

    this.clear(key);
    this.callbacks.set(key, callback);
    const flush = this.flush.bind(this, key);

    const idleMs = config?.idleMs ?? this.opts.idleMs; // flush after `idleMs` of idle (i.e., no new `enqueue` calls)
    const maxWaitMs = config?.maxWaitMs ?? this.opts.maxWaitMs; // but at least every `maxWaitMs`

    this.idleTimers.set(key, window.setTimeout(flush, idleMs));
    this.maxTimers.set(key, window.setTimeout(flush, maxWaitMs));
  }

  private flush(key: T) {
    this.callbacks.get(key)?.();
    this.clear(key);
  }

  static ValidateConfig(config: Config) {
    if (config.maxWaitMs < config.idleMs)
      throw new Error("maxWaitMs must be greater than or equal to idleMs");
  }
}
