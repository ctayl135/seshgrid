export type History<T> = {
  past: T[];
  present: T;
  future: T[];
  group?: string;
  at: number;
};
export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], at: 0 };
}
export function recordHistory<T>(
  state: History<T>,
  next: T,
  group?: string,
  at = Date.now(),
): History<T> {
  if (Object.is(state.present, next)) return state;
  const coalesce =
    !!group &&
    state.group === group &&
    at - state.at >= 0 &&
    at - state.at < 600 &&
    state.future.length === 0;
  return {
    past: coalesce ? state.past : [...state.past, state.present].slice(-60),
    present: next,
    future: [],
    group,
    at,
  };
}
export function undoHistory<T>(state: History<T>): History<T> {
  if (!state.past.length) return state;
  return {
    past: state.past.slice(0, -1),
    present: state.past.at(-1)!,
    future: [state.present, ...state.future],
    at: 0,
  };
}
export function redoHistory<T>(state: History<T>): History<T> {
  if (!state.future.length) return state;
  return {
    past: [...state.past, state.present].slice(-60),
    present: state.future[0],
    future: state.future.slice(1),
    at: 0,
  };
}
