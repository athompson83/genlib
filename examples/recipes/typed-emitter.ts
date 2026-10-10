// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: strongly typed event emitter with unsubscribe, once and waitFor. Original source; copy and adapt.
// In-process and synchronous. For cross-tab use BroadcastChannel; for cross-process use a queue.
//
//   type Events = { saved: { id: string }; closed: undefined };
//   const bus = new TypedEmitter<Events>();
//   const off = bus.on("saved", (e) => console.log(e.id));

export type Listener<P> = (payload: P) => void;
type Args<P> = undefined extends P ? [payload?: P] : [payload: P];

export interface EmitterOptions {
  /** Called when a listener throws; default rethrows an AggregateError after all listeners ran. */
  onListenerError?: (error: unknown, event: string) => void;
  /** Warn-level guard against listener leaks (default 100 per event). */
  maxListeners?: number;
}

export class TypedEmitter<Events extends object> {
  readonly #listeners = new Map<keyof Events, Set<Listener<never>>>();
  readonly #options: EmitterOptions;

  constructor(options: EmitterOptions = {}) { this.#options = options; }

  /** Subscribes and returns an unsubscribe function (call it on unmount/teardown). */
  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.#listeners.get(event);
    if (!set) { set = new Set(); this.#listeners.set(event, set); }
    if (set.size >= (this.#options.maxListeners ?? 100)) throw new RangeError(`Too many listeners for "${String(event)}"; check for missing unsubscribe`);
    set.add(listener as Listener<never>);
    return () => this.off(event, listener);
  }

  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    const off = this.on(event, (payload) => { off(); listener(payload); });
    return off;
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    const set = this.#listeners.get(event);
    set?.delete(listener as Listener<never>);
    if (set && set.size === 0) this.#listeners.delete(event);
  }

  /** Calls listeners in subscription order over a snapshot, so (un)subscribing during emit is safe. */
  emit<K extends keyof Events>(event: K, ...args: Args<Events[K]>): void {
    const set = this.#listeners.get(event);
    if (!set) return;
    const errors: unknown[] = [];
    for (const listener of [...set]) {
      try { (listener as Listener<Events[K]>)(args[0] as Events[K]); } catch (error) {
        if (this.#options.onListenerError) this.#options.onListenerError(error, String(event));
        else errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, `Listener failure for "${String(event)}"`);
  }

  listenerCount(event: keyof Events): number { return this.#listeners.get(event)?.size ?? 0; }

  removeAll(event?: keyof Events): void {
    if (event === undefined) this.#listeners.clear(); else this.#listeners.delete(event);
  }

  /** Resolves with the next payload of `event`; rejects on abort. */
  waitFor<K extends keyof Events>(event: K, options: { signal?: AbortSignal } = {}): Promise<Events[K]> {
    return new Promise((resolve, reject) => {
      const { signal } = options;
      if (signal?.aborted) { reject(signal.reason); return; }
      const onAbort = () => { off(); reject(signal?.reason); };
      const off = this.once(event, (payload) => { signal?.removeEventListener("abort", onAbort); resolve(payload); });
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}
