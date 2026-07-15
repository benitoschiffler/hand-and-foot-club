import { createClient } from "@supabase/supabase-js";
import type { GameState } from "../types";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const TABLES = {
  games: "hand_foot_games",
  players: "hand_foot_game_players",
  finished: "hand_foot_finished_games",
} as const;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export async function signIn(email: string) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) {
    throw error;
  }
}

export async function getSessionUser() {
  if (!supabase) {
    return null;
  }
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function createRoom(roomCode: string, hostId: string, state: GameState) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
  const { data, error } = await supabase
    .from(TABLES.games)
    .insert({ id: state.id, room_code: roomCode, host_id: hostId, state, updated_at: new Date().toISOString() })
    .select("id, updated_at")
    .single();
  if (error) {
    throw error;
  }
  return { id: data.id as string, updatedAt: data.updated_at as string };
}

export async function updateRoomState(gameId: string, state: GameState, expectedUpdatedAt: string | null) {
  if (!supabase) {
    return { conflict: false, updatedAt: null };
  }
  const updatedAt = new Date().toISOString();
  let query = supabase.from(TABLES.games).update({ state, updated_at: updatedAt }).eq("id", gameId);
  if (expectedUpdatedAt) {
    query = query.eq("updated_at", expectedUpdatedAt);
  }
  const { data, error } = await query.select("updated_at").maybeSingle();
  if (error) {
    throw error;
  }
  return data
    ? { conflict: false, updatedAt: data.updated_at as string }
    : { conflict: true, updatedAt: null };
}

export async function fetchRoomByCode(roomCode: string) {
  if (!supabase) {
    return null;
  }
  const { data, error } = await supabase.from(TABLES.games).select("id, state, updated_at").eq("room_code", roomCode).single();
  if (error) {
    return null;
  }
  return {
    id: data.id as string,
    state: data.state as GameState,
    updatedAt: data.updated_at as string,
  };
}

export async function joinRoomByCode(roomCode: string) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
  const { data, error } = await supabase.rpc("join_hand_foot_game", { p_room_code: roomCode.toUpperCase() });
  if (!error && data?.[0]) {
    const row = data[0] as {
      game_id: string;
      game_state: GameState;
      game_updated_at: string;
      player_seat: number;
    };
    return {
      id: row.game_id,
      state: row.game_state,
      updatedAt: row.game_updated_at,
      seat: row.player_seat,
    };
  }
  if (error) throw error;
  return null;
}

export function subscribeToRoom(gameId: string, onState: (state: GameState, updatedAt: string) => void) {
  if (!supabase) {
    return () => {};
  }
  const channel = supabase
    .channel(`game:${gameId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: TABLES.games, filter: `id=eq.${gameId}` },
      (payload) => onState(payload.new.state as GameState, payload.new.updated_at as string),
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log(`Successfully connected to room ${gameId}.`);
      } else if (status === 'CHANNEL_ERROR') {
        console.error(`Realtime channel error for room ${gameId}:`, err);
      } else if (status === 'TIMED_OUT') {
        console.error(`Realtime connection timed out for room ${gameId}.`);
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function recordFinishedGame(gameId: string | null, winnerId: string | null, scores: unknown) {
  if (!supabase) {
    return;
  }
  if (gameId) {
    const { data: existing } = await supabase.from(TABLES.finished).select("id").eq("game_id", gameId).maybeSingle();
    if (existing) {
      return;
    }
  }
  const { error } = await supabase.from(TABLES.finished).insert({ game_id: gameId, winner_id: winnerId, scores });
  if (error) {
    throw error;
  }
}

export async function fetchFinishedGames() {
  if (!supabase) {
    return [];
  }
  const { data, error } = await supabase.from(TABLES.finished).select("id, scores, created_at").order("created_at", { ascending: false }).limit(20);
  if (error || !data) {
    return [];
  }
  return data as Array<{ id: string; created_at: string; scores: Array<{ id: string; name: string; score: number }> }>;
}
