-- ============================================================
-- Migration : Hall of Fame des mèmes gagnants
-- À exécuter dans Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. Créer la table meme_hall_of_fame
CREATE TABLE IF NOT EXISTS public.meme_hall_of_fame (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Snapshot du mème (image URL + textes) pour l'afficher même si le mème est supprimé
  image_url text NOT NULL,
  template_name text,
  text_zones jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Infos du gagnant
  winner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  winner_username text NOT NULL,
  winner_avatar_url text,
  -- Score gagné lors de cette manche
  score_earned integer NOT NULL DEFAULT 0,
  -- Horodatage
  won_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Activer RLS
ALTER TABLE public.meme_hall_of_fame ENABLE ROW LEVEL SECURITY;

-- 3. Politique : tout le monde peut lire
CREATE POLICY "Allow anyone to read hall of fame"
  ON public.meme_hall_of_fame
  FOR SELECT
  TO authenticated
  USING (true);

-- 4. Politique : tout utilisateur authentifié peut insérer (l'hôte insère pour tous)
CREATE POLICY "Allow authenticated users to insert hall of fame"
  ON public.meme_hall_of_fame
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 5. Politique : les creators peuvent supprimer les entrées (modération)
CREATE POLICY "Allow creators to delete hall of fame entries"
  ON public.meme_hall_of_fame
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'creator'
    )
  );

-- 6. Ajouter à Realtime (optionnel, pour futures updates live)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.meme_hall_of_fame;
EXCEPTION WHEN others THEN
  NULL; -- Ignore si déjà ajouté
END $$;
