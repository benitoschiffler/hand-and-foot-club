create extension if not exists "pgcrypto";

create table if not exists public.hand_foot_games (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique check (room_code ~ '^[A-Z2-9]{6}$'),
  host_id uuid not null references auth.users (id) on delete cascade,
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hand_foot_game_players (
  game_id uuid not null references public.hand_foot_games (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  seat smallint not null check (seat in (0, 1)),
  created_at timestamptz not null default now(),
  primary key (game_id, user_id),
  unique (game_id, seat)
);

create table if not exists public.hand_foot_finished_games (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.hand_foot_games (id) on delete set null,
  winner_id uuid references auth.users (id) on delete set null,
  scores jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists hand_foot_one_result_per_online_game
on public.hand_foot_finished_games (game_id)
where game_id is not null;

create index if not exists hand_foot_game_players_user_id_idx
on public.hand_foot_game_players (user_id);

create index if not exists hand_foot_finished_games_winner_id_idx
on public.hand_foot_finished_games (winner_id);

alter table public.hand_foot_games enable row level security;
alter table public.hand_foot_game_players enable row level security;
alter table public.hand_foot_finished_games enable row level security;

grant select, insert on public.hand_foot_games to authenticated;
grant update (state, updated_at) on public.hand_foot_games to authenticated;
grant select on public.hand_foot_game_players to authenticated;
grant select, insert on public.hand_foot_finished_games to authenticated;

drop policy if exists "hand foot members can read games" on public.hand_foot_games;
create policy "hand foot members can read games"
on public.hand_foot_games for select
to authenticated
using (
  host_id = (select auth.uid())
  or exists (
    select 1
    from public.hand_foot_game_players gp
    where gp.game_id = id and gp.user_id = (select auth.uid())
  )
);

drop policy if exists "hand foot users can create games" on public.hand_foot_games;
create policy "hand foot users can create games"
on public.hand_foot_games for insert
to authenticated
with check (host_id = (select auth.uid()));

drop policy if exists "hand foot members can update games" on public.hand_foot_games;
create policy "hand foot members can update games"
on public.hand_foot_games for update
to authenticated
using (
  host_id = (select auth.uid())
  or exists (
    select 1
    from public.hand_foot_game_players gp
    where gp.game_id = id and gp.user_id = (select auth.uid())
  )
)
with check (
  host_id = (select auth.uid())
  or exists (
    select 1
    from public.hand_foot_game_players gp
    where gp.game_id = id and gp.user_id = (select auth.uid())
  )
);

drop policy if exists "hand foot users can read own seats" on public.hand_foot_game_players;
create policy "hand foot users can read own seats"
on public.hand_foot_game_players for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "hand foot players can read results" on public.hand_foot_finished_games;
create policy "hand foot players can read results"
on public.hand_foot_finished_games for select
to authenticated
using (
  winner_id = (select auth.uid())
  or exists (
    select 1 from public.hand_foot_game_players gp
    where gp.game_id = hand_foot_finished_games.game_id
      and gp.user_id = (select auth.uid())
  )
);

drop policy if exists "hand foot winners can record results" on public.hand_foot_finished_games;
create policy "hand foot winners can record results"
on public.hand_foot_finished_games for insert
to authenticated
with check (
  winner_id = (select auth.uid())
  and (
    game_id is null
    or exists (
      select 1 from public.hand_foot_game_players gp
      where gp.game_id = hand_foot_finished_games.game_id
        and gp.user_id = (select auth.uid())
    )
  )
);

create or replace function public.join_hand_foot_game(p_room_code text)
returns table (
  game_id uuid,
  game_state jsonb,
  game_updated_at timestamptz,
  player_seat smallint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user uuid := auth.uid();
  selected_game public.hand_foot_games%rowtype;
  selected_seat smallint;
begin
  if requesting_user is null then
    raise exception 'You must be signed in to join a room.';
  end if;

  select g.* into selected_game
  from public.hand_foot_games g
  where g.room_code = upper(trim(p_room_code));

  if not found then
    return;
  end if;

  select gp.seat into selected_seat
  from public.hand_foot_game_players gp
  where gp.game_id = selected_game.id and gp.user_id = requesting_user;

  if selected_seat is null then
    selected_seat := case when selected_game.host_id = requesting_user then 0 else 1 end;
    if exists (
      select 1 from public.hand_foot_game_players gp
      where gp.game_id = selected_game.id and gp.seat = selected_seat
    ) then
      raise exception 'That room is already full.';
    end if;

    insert into public.hand_foot_game_players (game_id, user_id, seat)
    values (selected_game.id, requesting_user, selected_seat);
  end if;

  return query select selected_game.id, selected_game.state, selected_game.updated_at, selected_seat;
end;
$$;

revoke all on function public.join_hand_foot_game(text) from public, anon;
grant execute on function public.join_hand_foot_game(text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'hand_foot_games'
  ) then
    alter publication supabase_realtime add table public.hand_foot_games;
  end if;
end;
$$;
