// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: small typed finite state machine with guards and an actor. Original source; copy and adapt.
// Transition targets are type-checked: a typo in a target state is a compile error.
//
//   const order = defineMachine({ initial: "draft", states: {
//     draft: { on: { SUBMIT: "pending" } }, pending: { on: { APPROVE: "approved", REJECT: "draft" } },
//     approved: { final: true } } });

export interface StateConfig<S extends string, E extends string> {
  on?: Partial<Record<E, S>>;
  final?: boolean;
}
export interface MachineConfig<S extends string, E extends string> {
  initial: S;
  states: Record<S, StateConfig<S, E>>;
}
export type Guard<S extends string, E extends string, C> = (from: S, event: E, context: C) => boolean;

export interface Machine<S extends string, E extends string> {
  readonly initial: S;
  /** Next state, or undefined when the event is not allowed in `from`. */
  next(from: S, event: E): S | undefined;
  can(from: S, event: E): boolean;
  events(from: S): E[];
  isFinal(state: S): boolean;
}

export function defineMachine<S extends string, E extends string>(config: MachineConfig<S, E>): Machine<S, E> {
  if (!(config.initial in config.states)) throw new Error(`Unknown initial state "${config.initial}"`);
  for (const [name, state] of Object.entries(config.states) as Array<[S, StateConfig<S, E>]>) {
    for (const target of Object.values(state.on ?? {}) as S[]) {
      if (!(target in config.states)) throw new Error(`State "${name}" targets unknown state "${target}"`);
    }
    if (state.final && state.on && Object.keys(state.on).length) throw new Error(`Final state "${name}" cannot have transitions`);
  }
  const next = (from: S, event: E): S | undefined => {
    const state = config.states[from];
    if (!state) throw new Error(`Unknown state "${from}"`);
    return Object.prototype.hasOwnProperty.call(state.on ?? {}, event) ? state.on?.[event] : undefined;
  };
  return {
    initial: config.initial,
    next,
    can: (from, event) => next(from, event) !== undefined,
    events: (from) => Object.keys(config.states[from]?.on ?? {}) as E[],
    isFinal: (state) => config.states[state]?.final === true,
  };
}

export class TransitionError extends Error {
  readonly from: string;
  readonly event: string;
  constructor(from: string, event: string) {
    super(`Event "${event}" is not allowed in state "${from}"`);
    this.from = from;
    this.event = event;
    this.name = "TransitionError";
  }
}

export interface Actor<S extends string, E extends string> {
  readonly state: S;
  send(event: E): S;
  subscribe(listener: (state: S, event: E, previous: S) => void): () => void;
}

/**
 * Stateful wrapper. `guard` can veto a transition using caller context (for example the user's
 * role); it supplements, never replaces, server-side authorization of the same action.
 */
export function createActor<S extends string, E extends string, C = undefined>(
  machine: Machine<S, E>, options: { initial?: S; context?: C; guard?: Guard<S, E, C> } = {},
): Actor<S, E> {
  let state = options.initial ?? machine.initial;
  const listeners = new Set<(state: S, event: E, previous: S) => void>();
  return {
    get state() { return state; },
    send(event) {
      const target = machine.next(state, event);
      if (target === undefined || (options.guard && !options.guard(state, event, options.context as C))) throw new TransitionError(state, event);
      const previous = state;
      state = target;
      for (const listener of [...listeners]) listener(state, event, previous);
      return state;
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
