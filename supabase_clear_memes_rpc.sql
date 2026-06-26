-- SQL Migration: clear_lobby_memes_and_votes RPC function
-- This function runs with SECURITY DEFINER privileges to bypass RLS policies
-- when resetting memes and votes for a lobby.

CREATE OR REPLACE FUNCTION public.clear_lobby_memes_and_votes(p_lobby_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Delete all votes associated with the memes in the lobby
  DELETE FROM public.votes
  WHERE meme_id IN (
    SELECT id FROM public.memes WHERE lobby_id = p_lobby_id
  );

  -- 2. Delete all memes in the lobby
  DELETE FROM public.memes
  WHERE lobby_id = p_lobby_id;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.clear_lobby_memes_and_votes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_lobby_memes_and_votes(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.clear_lobby_memes_and_votes(uuid) TO service_role;
