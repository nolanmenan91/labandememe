-- Supabase Setup Script for La Bande Meme
-- Contains schema for profiles, images, lobbies, players, memes, and votes tables
-- Includes Row Level Security (RLS) policies, Realtime settings, and Storage Bucket configuration

-- --------------------------------------------------
-- 1. EXTENSIONS
-- --------------------------------------------------
create extension if not exists "uuid-ossp";

-- --------------------------------------------------
-- 2. TABLES CREATION
-- --------------------------------------------------

-- Profiles table (linked to auth.users)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text not null,
  role text not null check (role in ('creator', 'player')) default 'player',
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Images (Meme Templates) table
create table if not exists public.images (
  id uuid default gen_random_uuid() primary key,
  url text not null,
  name text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  approved boolean not null default false,
  text_zones jsonb not null default '[]'::jsonb, -- Predefined text boxes [{"id": 1, "x": 10, "y": 10, "width": 80, "height": 15}]
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Lobbies table
create table if not exists public.lobbies (
  id uuid default gen_random_uuid() primary key,
  code varchar(4) not null unique,
  creator_id uuid references public.profiles(id) on delete cascade not null,
  status text not null check (status in ('lobby', 'writing', 'voting', 'results', 'ended')) default 'lobby',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Players table (association between profile and lobby)
create table if not exists public.players (
  id uuid default gen_random_uuid() primary key,
  lobby_id uuid references public.lobbies(id) on delete cascade not null,
  profile_id uuid references public.profiles(id) on delete cascade not null,
  score integer not null default 0,
  is_ready boolean not null default false,
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  last_seen_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (lobby_id, profile_id)
);

-- Memes table (submitted memes by players)
create table if not exists public.memes (
  id uuid default gen_random_uuid() primary key,
  lobby_id uuid references public.lobbies(id) on delete cascade not null,
  image_id uuid references public.images(id) on delete cascade not null,
  profile_id uuid references public.profiles(id) on delete cascade not null,
  text_zones jsonb not null, -- Stores structure: [{ text: "...", x: 0.1, y: 0.2, ... }]
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (lobby_id, profile_id)
);

-- Votes table
create table if not exists public.votes (
  id uuid default gen_random_uuid() primary key,
  meme_id uuid references public.memes(id) on delete cascade not null,
  voter_id uuid references public.profiles(id) on delete cascade not null,
  vote text not null check (vote in ('bien', 'mouais', 'nul')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (meme_id, voter_id)
);

-- --------------------------------------------------
-- 3. TRIGGERS FOR PROFILE CREATION ON SIGNUP
-- --------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, role)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'username',
      split_part(new.email, '@', 1)
    ),
    coalesce(
      new.raw_user_meta_data->>'role',
      'player'
    )
  );
  return new;
end;
$$ language plpgsql security definer;

-- Recreate trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- --------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS)
-- --------------------------------------------------

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.images enable row level security;
alter table public.lobbies enable row level security;
alter table public.players enable row level security;
alter table public.memes enable row level security;
alter table public.votes enable row level security;

-- Profiles Policies
create policy "Allow authenticated to view profiles" on public.profiles
  for select to authenticated using (true);

create policy "Allow users to update their own profile" on public.profiles
  for update to authenticated using (auth.uid() = id);

-- Images Policies
create policy "Allow users to select approved or own images" on public.images
  for select to authenticated using (
    approved = true or uploaded_by = auth.uid() or (
      exists (select 1 from public.profiles where id = auth.uid() and role = 'creator')
    )
  );

create policy "Allow authenticated users to insert images" on public.images
  for insert to authenticated with check (uploaded_by = auth.uid());

create policy "Allow creators to update images" on public.images
  for update to authenticated using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'creator')
  );

create policy "Allow creators to delete images" on public.images
  for delete to authenticated using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'creator')
  );

-- Lobbies Policies
create policy "Allow authenticated users to view lobbies" on public.lobbies
  for select to authenticated using (true);

create policy "Allow authenticated users to insert lobbies" on public.lobbies
  for insert to authenticated with check (creator_id = auth.uid());

create policy "Allow lobby creator to update lobby" on public.lobbies
  for update to authenticated using (creator_id = auth.uid());

-- Players Policies
create policy "Allow authenticated users to view players" on public.players
  for select to authenticated using (true);

create policy "Allow authenticated users to insert players" on public.players
  for insert to authenticated with check (profile_id = auth.uid());

create policy "Allow players or creator to update player state" on public.players
  for update to authenticated using (
    profile_id = auth.uid() or exists (
      select 1 from public.lobbies where id = lobby_id and creator_id = auth.uid()
    )
  );

create policy "Allow players or creator to delete players" on public.players
  for delete to authenticated using (
    profile_id = auth.uid() or exists (
      select 1 from public.lobbies where id = lobby_id and creator_id = auth.uid()
    )
  );

-- Memes Policies
create policy "Allow authenticated users to view memes" on public.memes
  for select to authenticated using (true);

create policy "Allow authenticated users to insert memes" on public.memes
  for insert to authenticated with check (profile_id = auth.uid());

create policy "Allow owners to update their own memes" on public.memes
  for update to authenticated using (profile_id = auth.uid());

create policy "Allow owners or creator to delete memes" on public.memes
  for delete to authenticated using (
    profile_id = auth.uid() or exists (
      select 1 from public.lobbies where id = lobby_id and creator_id = auth.uid()
    )
  );

-- Votes Policies
create policy "Allow authenticated users to view votes" on public.votes
  for select to authenticated using (true);

create policy "Allow authenticated users to insert votes" on public.votes
  for insert to authenticated with check (voter_id = auth.uid());

create policy "Allow voters to update their own votes" on public.votes
  for update to authenticated using (voter_id = auth.uid());

create policy "Allow voters to delete their own votes" on public.votes
  for delete to authenticated using (voter_id = auth.uid());


-- --------------------------------------------------
-- 5. REALTIME CONFIGURATION
-- --------------------------------------------------

-- Add tables to the list of published tables for realtime
-- We wrap it in a DO block to ignore warnings if they are already added
do $$
begin
  alter publication supabase_realtime add table public.lobbies, public.players, public.memes, public.votes;
exception when others then
  -- Ignore errors if tables are already in the publication
  null;
end $$;

-- --------------------------------------------------
-- 6. STORAGE BUCKET & STORAGE POLICIES
-- --------------------------------------------------

-- Ensure the meme-templates bucket exists
insert into storage.buckets (id, name, public)
values ('meme-templates', 'meme-templates', true)
on conflict (id) do nothing;

-- Storage Policies for 'meme-templates' bucket
create policy "Allow public/authenticated read of meme templates"
  on storage.objects for select
  using (bucket_id = 'meme-templates');

create policy "Allow authenticated uploads to meme templates"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'meme-templates');

create policy "Allow creator admin to delete meme templates"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'meme-templates' and exists (
      select 1 from public.profiles where id = auth.uid() and role = 'creator'
    )
  );

create policy "Allow creator admin to update meme templates"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'meme-templates' and exists (
      select 1 from public.profiles where id = auth.uid() and role = 'creator'
    )
  );

-- --------------------------------------------------
-- 7. PLAYER STATISTICS AND RANKING SYSTEMS
-- --------------------------------------------------

-- Alter profiles table to add statistics columns
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS games_played integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS games_won integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_points integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS rounds_won integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_votes_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_votes_value_sum numeric NOT NULL DEFAULT 0;

-- RPC function to record game results at the end of the game
CREATE OR REPLACE FUNCTION public.record_game_results(
  winner_ids uuid[],
  player_results jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  player_record jsonb;
  p_id uuid;
  p_score integer;
BEGIN
  -- Increment games_won for the winners
  IF winner_ids IS NOT NULL AND array_length(winner_ids, 1) > 0 THEN
    UPDATE public.profiles
    SET games_won = games_won + 1
    WHERE id = ANY(winner_ids);
  END IF;

  -- Increment games_played and total_points for all participants
  FOR player_record IN SELECT * FROM jsonb_array_elements(player_results) LOOP
    p_id := (player_record->>'profile_id')::uuid;
    p_score := (player_record->>'score')::integer;
    
    UPDATE public.profiles
    SET 
      games_played = games_played + 1,
      total_points = total_points + p_score
    WHERE id = p_id;
  END LOOP;
END;
$$;

-- RPC function to record round winners when a round results page is shown
CREATE OR REPLACE FUNCTION public.record_round_winners(
  winner_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF winner_ids IS NOT NULL AND array_length(winner_ids, 1) > 0 THEN
    UPDATE public.profiles
    SET rounds_won = rounds_won + 1
    WHERE id = ANY(winner_ids);
  END IF;
END;
$$;

-- RPC function to record round votes/ratings when a round results page is shown
CREATE OR REPLACE FUNCTION public.record_round_votes(
  votes_data jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  vote_record jsonb;
  p_id uuid;
  v_count integer;
  v_sum numeric;
BEGIN
  FOR vote_record IN SELECT * FROM jsonb_array_elements(votes_data) LOOP
    p_id := (vote_record->>'profile_id')::uuid;
    v_count := (vote_record->>'votes_count')::integer;
    v_sum := (vote_record->>'votes_value_sum')::numeric;
    
    UPDATE public.profiles
    SET 
      total_votes_count = total_votes_count + v_count,
      total_votes_value_sum = total_votes_value_sum + v_sum
    WHERE id = p_id;
  END LOOP;
END;
$$;


-- RPC function to clean up stale player records
CREATE OR REPLACE FUNCTION public.clean_stale_players()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.players
  WHERE last_seen_at < now() - INTERVAL '60 seconds';
END;
$$;


