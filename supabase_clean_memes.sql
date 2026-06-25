-- ============================================================
-- Script de nettoyage des mèmes et votes résiduels
-- À exécuter dans le SQL Editor de Supabase si des mèmes
-- fantômes apparaissent lors des votes.
-- ============================================================

-- 1. Supprimer tous les votes liés aux mèmes du lobby 'GAME'
DELETE FROM public.votes
WHERE meme_id IN (
  SELECT m.id
  FROM public.memes m
  INNER JOIN public.lobbies l ON l.id = m.lobby_id
  WHERE l.code = 'GAME'
);

-- 2. Supprimer tous les mèmes du lobby 'GAME'
DELETE FROM public.memes
WHERE lobby_id IN (
  SELECT id FROM public.lobbies WHERE code = 'GAME'
);

-- 3. (Optionnel) Remettre le lobby 'GAME' au statut initial
UPDATE public.lobbies
SET status = 'lobby', current_round = 0
WHERE code = 'GAME';

-- Vérification : s'assurer que la table memes est vide pour le lobby GAME
SELECT COUNT(*) AS memes_restants
FROM public.memes
WHERE lobby_id IN (SELECT id FROM public.lobbies WHERE code = 'GAME');
