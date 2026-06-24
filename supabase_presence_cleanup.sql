-- SQL Script to enable player presence heartbeat and cleanup in Supabase
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New query)

-- 1. Add last_seen_at column to the players table if it doesn't already exist
ALTER TABLE public.players
ADD COLUMN IF NOT EXISTS last_seen_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL;

-- 2. Create the RPC function to clean up stale player records
-- Players who have not sent a heartbeat (updated their last_seen_at) in the last 30 seconds will be deleted.
-- This function runs with SECURITY DEFINER privileges to bypass row-level security (RLS) for cleanup.
CREATE OR REPLACE FUNCTION public.clean_stale_players()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.players
  WHERE last_seen_at < now() - INTERVAL '30 seconds';
END;
$$;
