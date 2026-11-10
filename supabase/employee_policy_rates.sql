-- Additional columns for a2i allowance schedules provided by the project owner.
-- Existing employee/trip/claim data is preserved.
alter table public.employees
 add column if not exists office_name text not null default '',
 add column if not exists dsa_band smallint check (dsa_band between 1 and 4),
 add column if not exists travel_band smallint check (travel_band between 1 and 7);
alter table public.trips
 add column if not exists dsa_area text not null default 'other'
 check (dsa_area in ('special', 'other'));
alter table public.trip_travelers
 add column if not exists transport_class text not null default 'other'
 check (transport_class in ('car', 'other'));
