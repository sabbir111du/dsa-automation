-- One-time, per-account import of the 18 approved names (excluding Md. Jeyson/Jeson Jaman Sawan).
-- Names and designations originate from the user's employee list; categories from the attached
-- DSA and travel allowance schedules. All pre-filled profiles use Team = Nothi and Office = Aspire to Innovate (a2i) Programme.
-- A transaction-scoped advisory lock and owner marker make this idempotent across tabs.
create table if not exists public.employee_directory_setup (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 seeded_at timestamptz not null default now(),
 seeded_count integer not null default 0
);
alter table public.employee_directory_setup enable row level security;
revoke all on public.employee_directory_setup from anon;
grant select, insert on public.employee_directory_setup to authenticated;
drop policy if exists employee_directory_setup_owner on public.employee_directory_setup;
create policy employee_directory_setup_owner on public.employee_directory_setup
 for all to authenticated using (owner_id=(select auth.uid()))
 with check (owner_id=(select auth.uid()));

create or replace function public.seed_initial_employee_directory()
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
 uid uuid := (select auth.uid());
 added integer := 0;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(uid::text));
 if exists (select 1 from public.employee_directory_setup where owner_id = uid) then return 0; end if;
 with candidate(full_name,designation,dsa_band,travel_band) as (
  values
    ('Abu Shaleh Md. Mahfuzul Alam', 'Senior Consultant (Nothi)', 1, 3),
    ('Imrul Hosain', 'Consultant', 2, 4),
    ('Mazedul Alam', 'Consultant', 2, 4),
    ('Borhan Uddin', 'Jr. Consultant', 2, 5),
    ('Mazeda Khatun', 'Jr. Consultant', 2, 5),
    ('Md. Shahazin Shahariar Shohan', 'Jr. Consultant', 2, 5),
    ('Md. Shzibur Rahman Sarder', 'Jr. Consultant', 2, 5),
    ('Md. Sumon Khan', 'Jr. Consultant', 2, 5),
    ('Mahmudah Amathullah Pritu', 'Jr. Consultant', 2, 5),
    ('Md. Mahbubur Rahman', 'Jr. Consultant', 2, 5),
    ('Md. Sabbir Ahmed', 'Jr. Consultant', 2, 5),
    ('S.K. Al-Abid', 'Jr. Consultant', 2, 5),
    ('Kabary Sultana', 'Young Professional', 3, 6),
    ('Md. Mahbub Newaz', 'Young Professional', 3, 6),
    ('Ahmadul Hasan', 'Young Professional', 3, 6),
    ('Abdullah Al Muhimin', 'Young Professional', 3, 6),
    ('MST. Anmun Jesmin', 'Young Professional', 3, 6),
    ('Jahanara Khatun', 'Young Professional', 3, 6)
 )
 insert into public.employees(owner_id,full_name,designation,team,office_name,dsa_band,travel_band,daily_dsa_rate,km_rate)
 select uid,c.full_name,c.designation,'Nothi','Aspire to Innovate (a2i) Programme',c.dsa_band,c.travel_band,
        case c.dsa_band when 1 then 5000 when 2 then 4500 when 3 then 2500 else 2000 end,
        case c.travel_band when 5 then 15 when 6 then 10 when 7 then 8 else 18 end
 from candidate c
 where not exists (
   select 1 from public.employees e
   where e.owner_id=uid and pg_catalog.lower(pg_catalog.btrim(e.full_name))=pg_catalog.lower(pg_catalog.btrim(c.full_name))
 );
 get diagnostics added = row_count;
 insert into public.employee_directory_setup(owner_id,seeded_count) values(uid,added);
 return added;
end
$$;
revoke execute on function public.seed_initial_employee_directory() from public, anon;
grant execute on function public.seed_initial_employee_directory() to authenticated;
