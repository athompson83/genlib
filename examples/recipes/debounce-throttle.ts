// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: debounce and throttle with cancel, flush and pending. Original source; copy and adapt.
// Timer-based (setTimeout only), so it runs in browsers, Node and workers. In React, create the
// wrapper once (useMemo/useRef) and call cancel() on unmount.

export interface Controlled<A extends unknown[]> {
  (...args: A): void;
  /** Drops any scheduled call. */
  cancel(): void;
  /** Runs a scheduled call immediately, if one is pending. */
  flush(): void;
  pending(): boolean;
}

export interface DebounceOptions { leading?: boolean; trailing?: boolean }

/** Calls `fn` once calls stop for `waitMs`. leading: also call on the first call of a burst. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, waitMs: number, options: DebounceOptions = {}): Controlled<A> {
  if (!(waitMs >= 0)) throw new RangeError("waitMs must be >= 0");
  const leading = options.leading ?? false;
  const trailing = options.trailing ?? true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: A | undefined;

  const fire = () => {
    const args = lastArgs;
    lastArgs = undefined;
    if (args) fn(...args);
  };
  const onTimeout = () => {
    timer = undefined;
    if (trailing) fire();
    lastArgs = undefined;
  };
  const wrapped = ((...args: A) => {
    const startOfBurst = timer === undefined;
    lastArgs = args;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(onTimeout, waitMs);
    if (leading && startOfBurst) fire();
  }) as Controlled<A>;
  wrapped.cancel = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; lastArgs = undefined; };
  wrapped.flush = () => { if (timer === undefined) return; clearTimeout(timer); timer = undefined; fire(); };
  wrapped.pending = () => timer !== undefined && lastArgs !== undefined;
  return wrapped;
}

export interface ThrottleOptions { leading?: boolean; trailing?: boolean }

/** Calls `fn` at most once per `intervalMs`; the trailing call uses the latest arguments. */
export function throttle<A extends unknown[]>(fn: (...args: A) => void, intervalMs: number, options: ThrottleOptions = {}): Controlled<A> {
  if (!(intervalMs > 0)) throw new RangeError("intervalMs must be > 0");
  const leading = options.leading ?? true;
  const trailing = options.trailing ?? true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: A | undefined;

  const tick = () => {
    if (trailing && lastArgs) {
      const args = lastArgs;
      lastArgs = undefined;
      fn(...args);
      timer = setTimeout(tick, intervalMs); // keep the window open after a trailing call
    } else {
      timer = undefined;
      lastArgs = undefined;
    }
  };
  const wrapped = ((...args: A) => {
    if (timer === undefined) {
      timer = setTimeout(tick, intervalMs);
      if (leading) { fn(...args); return; }
    }
    lastArgs = args;
  }) as Controlled<A>;
  wrapped.cancel = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; lastArgs = undefined; };
  wrapped.flush = () => {
    if (timer === undefined || !lastArgs) return;
    const args = lastArgs;
    lastArgs = undefined;
    fn(...args);
  };
  wrapped.pending = () => lastArgs !== undefined;
  return wrapped;
}
