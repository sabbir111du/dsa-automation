-- Trip retention: 15-day active workspace, with financial claim preservation.
-- Old draft trips with no claim records are removed daily.
-- Trips with claims, and submitted/completed trips, are retained for audit.
-- Existing DOCX and ZIP outputs are generated on demand and not saved in PostgreSQL.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'dsa-prune-unclaimed-drafts-15-days',
  '15 3 * * *',
  $job$
    delete from public.trips t
    where t.created_at < now() - interval '15 days'
      and t.status = 'draft'
      and not exists (select 1 from public.dsa_claims c where c.trip_id = t.id);
  $job$
);
