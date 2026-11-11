-- Preserve each employee's Air / Other allowance choice independently for every trip leg.
-- Previously saved single-method assignments continue to work as a fallback.
alter table public.trip_travelers
 add column if not exists leg_modes jsonb not null default '{}'::jsonb;
alter table public.trip_travelers
 drop constraint if exists trip_travelers_leg_modes_object;
alter table public.trip_travelers
 add constraint trip_travelers_leg_modes_object check (jsonb_typeof(leg_modes) = 'object');
comment on column public.trip_travelers.leg_modes is
 'Map of travel_legs.id to air or other for the selected employee. Existing owner-only RLS applies.';
