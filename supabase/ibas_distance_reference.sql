alter table public.travel_legs add column if not exists distance_source text not null default 'manual', add column if not exists distance_verified boolean not null default false;
