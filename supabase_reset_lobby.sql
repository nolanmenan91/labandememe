-- SQL Script to add the reset_lobby_if_empty RPC function in Supabase
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New query)

CREATE OR REPLACE FUNCTION public.reset_lobby_if_empty(p_lobby_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Reset status to 'lobby' and round to 0 if there are no active players
  IF NOT EXISTS (
    SELECT 1 FROM public.players WHERE lobby_id = p_lobby_id
  ) THEN
    UPDATE public.lobbies
    SET status = 'lobby', current_round = 0
    WHERE id = p_lobby_id;
  END IF;
END;
$$;
