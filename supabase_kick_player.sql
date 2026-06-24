-- SQL Script to add the kick_player RPC function in Supabase
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New query)

CREATE OR REPLACE FUNCTION public.kick_player(p_lobby_id uuid, p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify if the calling user has the 'creator' role (admin) OR is the creator of the lobby
  IF EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'creator'
  ) OR EXISTS (
    SELECT 1 FROM public.lobbies WHERE id = p_lobby_id AND creator_id = auth.uid()
  ) THEN
    DELETE FROM public.players
    WHERE lobby_id = p_lobby_id AND profile_id = p_profile_id;
  ELSE
    RAISE EXCEPTION 'Only administrators or the lobby creator can kick players.';
  END IF;
END;
$$;
