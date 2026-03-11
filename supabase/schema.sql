create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  host_id uuid references public.profiles (id) on delete set null,
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_players (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  seat integer not null,
  created_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

create table if not exists public.finished_games (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.games (id) on delete set null,
  winner_id uuid references public.profiles (id) on delete set null,
  scores jsonb not null,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(coalesce(new.email, 'player'), '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.finished_games enable row level security;

create policy "profiles are readable"
on public.profiles for select
using (true);

create policy "users can update own profile"
on public.profiles for update
using (auth.uid() = id);

create policy "users can insert own profile"
on public.profiles for insert
with check (auth.uid() = id);

create policy "authenticated can read games"
on public.games for select
using (auth.role() = 'authenticated');

create policy "authenticated can create games"
on public.games for insert
with check (auth.role() = 'authenticated');

create policy "room members can update games"
on public.games for update
using (
  exists (
    select 1
    from public.game_players gp
    where gp.game_id = id and gp.user_id = auth.uid()
  )
);

create policy "authenticated can read seats"
on public.game_players for select
using (auth.role() = 'authenticated');

create policy "authenticated can join seats"
on public.game_players for insert
with check (auth.uid() = user_id);

create policy "authenticated can read finished games"
on public.finished_games for select
using (auth.role() = 'authenticated');

create policy "authenticated can insert finished games"
on public.finished_games for insert
with check (auth.role() = 'authenticated');
