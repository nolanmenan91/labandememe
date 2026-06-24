-- SQL Update script to add player statistics to the profiles table
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New query)

-- 1. Alter profiles table to add statistics columns
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS games_played integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS games_won integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_points integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS rounds_won integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_votes_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_votes_value_sum numeric NOT NULL DEFAULT 0;

-- 2. Create RPC function to record game results at the end of the game (runs as admin/security definer)
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

-- 3. Create RPC function to record round winners when a round results page is shown
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

-- 4. Create RPC function to record round votes/ratings when a round results page is shown
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
