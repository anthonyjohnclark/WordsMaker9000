export type NavigationHistoryState = {
  entries: string[];
  index: number;
};

export type NavigationHistoryAction = "POP" | "PUSH" | "REPLACE";

export function createNavigationHistory(
  locationKey: string,
): NavigationHistoryState {
  return {
    entries: [locationKey],
    index: 0,
  };
}

export function updateNavigationHistory(
  state: NavigationHistoryState,
  navigationType: NavigationHistoryAction,
  locationKey: string,
): NavigationHistoryState {
  if (navigationType === "PUSH") {
    if (state.entries[state.index] === locationKey) return state;

    const entries = state.entries.slice(0, state.index + 1);
    entries.push(locationKey);
    return {
      entries,
      index: entries.length - 1,
    };
  }

  if (navigationType === "REPLACE") {
    if (state.entries[state.index] === locationKey) return state;

    const entries = [...state.entries];
    entries[state.index] = locationKey;
    return {
      entries,
      index: state.index,
    };
  }

  if (navigationType === "POP") {
    const index = state.entries.indexOf(locationKey);
    if (index >= 0) {
      if (index === state.index) return state;
      return {
        entries: state.entries,
        index,
      };
    }

    return createNavigationHistory(locationKey);
  }

  return state;
}

export function canNavigateBack(state: NavigationHistoryState): boolean {
  return state.index > 0;
}

export function canNavigateForward(state: NavigationHistoryState): boolean {
  return state.index < state.entries.length - 1;
}
