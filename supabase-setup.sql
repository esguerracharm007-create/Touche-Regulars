-- Touché Regulars: one-time database setup.
-- In Supabase open SQL Editor > New query, paste ALL of this, and press Run.
-- Then change the email on the LAST line to your own and run that line too.

-- 1. Member profiles ---------------------------------------------------------
create table if not exists public.members (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text not null,
  usual text,
  code text unique not null,
  joined date not null default current_date,
  rsvp boolean not null default false,   -- asked for a first sip
  draw boolean not null default false,   -- name is in the members' draw
  gift boolean not null default false    -- opened Pugo's surprise
);

-- 2. Stamps, added by staff only ---------------------------------------------
create table if not exists public.stamps (
  member_id uuid not null references public.members (id) on delete cascade,
  stamp_id text not null,
  stamped_by text,
  created_at timestamptz not null default now(),
  primary key (member_id, stamp_id)
);

-- 3. Who counts as staff (emails of you and your baristas) --------------------
create table if not exists public.staff (
  email text primary key
);

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

grant execute on function public.is_staff() to authenticated;

-- 4. Lock everything down -----------------------------------------------------
alter table public.members enable row level security;
alter table public.stamps enable row level security;
alter table public.staff enable row level security;   -- no policies: nobody reads it from the site

drop policy if exists "members: read own or staff" on public.members;
drop policy if exists "members: add own" on public.members;
drop policy if exists "members: update own" on public.members;
drop policy if exists "members: delete own" on public.members;
drop policy if exists "stamps: read own or staff" on public.stamps;
drop policy if exists "stamps: staff add" on public.stamps;
drop policy if exists "stamps: staff remove" on public.stamps;

create policy "members: read own or staff" on public.members
  for select to authenticated using (auth.uid() = id or public.is_staff());

create policy "members: add own" on public.members
  for insert to authenticated with check (auth.uid() = id);

create policy "members: update own" on public.members
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "members: delete own" on public.members
  for delete to authenticated using (auth.uid() = id);

create policy "stamps: read own or staff" on public.stamps
  for select to authenticated using (auth.uid() = member_id or public.is_staff());

create policy "stamps: staff add" on public.stamps
  for insert to authenticated with check (public.is_staff());

create policy "stamps: staff remove" on public.stamps
  for delete to authenticated using (public.is_staff());

-- 5. Make yourself staff. Change the email, then run this line. ---------------
-- Add one line like this for each barista who should use the staff page.
insert into public.staff (email) values ('you@example.com') on conflict do nothing;
