# Phase 3 report migration follow-up

Goal: align `supabase/place-reports.sql` with the production Around My Dorm admin authorization pattern (`auth.jwt().app_metadata.amd_admin` and non-anonymous sessions), verify with TDD, apply the migration, inspect RLS/RPC objects, and run final CI.
