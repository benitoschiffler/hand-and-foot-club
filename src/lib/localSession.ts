import type { GameState } from "../types";

const SESSION_KEY = "hand-and-foot-current-game-v1";

export interface SavedGameSession {
  state: GameState;
  viewerPlayerId: string;
  savedAt: string;
}

export function loadGameSession(): SavedGameSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedGameSession;
    if (!parsed.state?.id || !parsed.viewerPlayerId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveGameSession(state: GameState, viewerPlayerId: string) {
  if (state.winnerId) {
    clearGameSession();
    return;
  }
  const session: SavedGameSession = {
    state,
    viewerPlayerId,
    savedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearGameSession() {
  window.localStorage.removeItem(SESSION_KEY);
}
