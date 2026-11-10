-- DSA Automation schema snapshot (initially applied to the dedicated Biborno project).
-- All user data lives in owned rows and public tables have RLS.
create extension if not exists pgcrypto;
create table if not exists public.employees (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 full_name text not null check(length(trim(full_name)) between 2 and 150),
 designation text not null default '', team text not null default '',
 daily_dsa_rate numeric(12,2) not null default 0 check(daily_dsa_rate >= 0),
 km_rate numeric(12,2) not null default 0 check(km_rate >= 0),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(owner_id,id)
);
create table if not exists public.trips (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null, purpose text not null, destination text not null,
 start_date date not null, end_date date not null,
 travel_organizer text not null default 'a2i',mode text not null default 'Road',
 status text not null default 'draft' check(status in ('draft','submitted','completed')),
 created_at timestamptz not null default now(),
 check(end_date >= start_date),unique(owner_id,id)
);
create table if not exists public.trip_itinerary (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 trip_id uuid not null, visit_date date not null,
 location text not null,activity text not null,
 created_at timestamptz not null default now(),
 foreign key(owner_id,trip_id) references public.trips(owner_id,id) on delete cascade,
 unique(owner_id,id)
);
create table if not exists public.travel_legs (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 trip_id uuid not null,from_city text not null,to_city text not null,
 depart_date date not null,depart_time time,
 arrive_date date not null,arrive_time time,
 mode text not null default 'Road',
 distance_km numeric(12,2) not null default 0 check(distance_km >= 0),
 km_rate numeric(12,2) not null default 0 check(km_rate >= 0),
 created_at timestamptz not null default now(),
 foreign key(owner_id,trip_id) references public.trips(owner_id,id) on delete cascade,
 check(arrive_date >= depart_date),unique(owner_id,id)
);
create table if not exists public.trip_travelers (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 trip_id uuid not null,employee_id uuid not null,
 approved_full_days numeric(6,2) not null default 0 check(approved_full_days >= 0 and approved_full_days <= 365),
 approved_half_days numeric(6,2) not null default 0 check(approved_half_days >= 0 and approved_half_days <= 365),
 ta_multiplier numeric(6,3) not null default 1 check(ta_multiplier >= 0 and ta_multiplier <= 10),
 dsa_rate_override numeric(12,2) check(dsa_rate_override >= 0),
 created_at timestamptz not null default now(),
 foreign key(owner_id,trip_id) references public.trips(owner_id,id) on delete cascade,
 foreign key(owner_id,employee_id) references public.employees(owner_id,id) on delete cascade,
 unique(trip_id,employee_id),unique(owner_id,id)
);
create table if not exists public.allowance_rates (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 label text not null,daily_dsa_rate numeric(12,2) not null check(daily_dsa_rate >= 0),
 km_rate numeric(12,2) not null check(km_rate >= 0),
 created_at timestamptz not null default now(),
 unique(owner_id,id)
);
create table if not exists public.dsa_claims (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 trip_id uuid not null,employee_id uuid not null,
 dsa_amount numeric(14,2) not null check(dsa_amount >= 0),
 travel_amount numeric(14,2) not null check(travel_amount >= 0),
 total_amount numeric(14,2) generated always as (dsa_amount+travel_amount) stored,
 created_at timestamptz not null default now(),
 foreign key(owner_id,trip_id) references public.trips(owner_id,id) on delete cascade,
 foreign key(owner_id,employee_id) references public.employees(owner_id,id) on delete cascade,
 unique(trip_id,employee_id)
);
create index if not exists employees_owner_idx on public.employees(owner_id);
create index if not exists trips_owner_idx on public.trips(owner_id,created_at desc);
create index if not exists travel_legs_trip_idx on public.travel_legs(owner_id,trip_id);
create index if not exists trip_itinerary_trip_idx on public.trip_itinerary(owner_id,trip_id);
create index if not exists trip_travelers_trip_idx on public.trip_travelers(owner_id,trip_id);
create index if not exists dsa_claims_trip_idx on public.dsa_claims(owner_id,trip_id);
do $$
declare t text;
begin
 foreach t in array array['employees','trips','trip_itinerary','travel_legs','trip_travelers','allowance_rates','dsa_claims']
 loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon',t);
 execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 execute format('drop policy if exists "owner_only" on public.%I',t);
 execute format('create policy "owner_only" on public.%I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))',t);
 end loop;
end $$;
