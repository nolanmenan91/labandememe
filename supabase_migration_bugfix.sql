-- ============================================================
-- Migration: Fix bug - transition de manche et reconnexion
-- Date: 2026-06-27
-- ============================================================

-- 1. Modifier la contrainte CHECK sur lobbies.status pour accepter 'results'
--    (necessaire pour ecrire la phase 'results' en DB lors de la transition)
ALTER TABLE public.lobbies 
  DROP CONSTRAINT IF EXISTS lobbies_status_check;

ALTER TABLE public.lobbies 
  ADD CONSTRAINT lobbies_status_check 
  CHECK (status IN ('lobby', 'writing', 'voting', 'results', 'ended'));

-- 2. Augmenter le timeout de clean_stale_players de 30s a 60s
--    (pour permettre un refresh de page sans se faire supprimer de la partie)
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
