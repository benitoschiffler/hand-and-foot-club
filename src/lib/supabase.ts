import { createClient } from "@supabase/supabase-js";
import type { GameState } from "../types";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export async function signIn(email: string) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
  const { error } = await supabase.auth.signInWithOtp({ email });
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
    .from("games")
    .insert({ id: state.id, room_code: roomCode, host_id: hostId, state })
    .select("id")
    .single();
  if (error) {
    throw error;
  }
  return data.id as string;
}

export async function joinRoom(gameId: string, userId: string, seat: number) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
  const { error } = await supabase.from("game_players").upsert({ game_id: gameId, user_id: userId, seat: seat });
  if (error) {
    throw error;
  }
}

export async function updateRoomState(gameId: string, state: GameState) {
  if (!supabase) {
    return;
  }
  await supabase.from("games").update({ state, updated_at: new Date().toISOString() }).eq("id", gameId);
}

export async function fetchRoomByCode(roomCode: string) {
  if (!supabase) {
    return null;
  }
  const { data, error } = await supabase.from("games").select("id, state").eq("room_code", roomCode).single();
  if (error) {
    return null;
  }
  return data as { id: string; state: GameState };
}

export function subscribeToRoom(gameId: string, onState: (state: GameState) => void) {
  if (!supabase) {
    return () => {};
  }
  const channel = supabase
    .channel(`game:${gameId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` },
      (payload) => onState(payload.new.state as GameState),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function recordFinishedGame(gameId: string | null, winnerId: string | null, scores: unknown) {
  if (!supabase) {
    return;
  }
  await supabase.from("finished_games").insert({ game_id: gameId, winner_id: winnerId, scores });
}

export async function fetchFinishedGames() {
  if (!supabase) {
    return [];
  }
  const { data, error } = await supabase.from("finished_games").select("id, scores, created_at").order("created_at", { ascending: false }).limit(20);
  if (error || !data) {
    return [];
  }
  return data as Array<{ id: string; created_at: string; scores: Array<{ id: string; name: string; score: number }> }>;
}
