-- Vertrektijd-agenda — databaseschema voor account & synchronisatie.
--
-- Draai dit één keer in je Supabase-project:
--   Supabase dashboard -> SQL Editor -> New query -> plak dit -> Run.
--
-- Het maakt één tabel waarin per gebruiker de volledige agenda als JSON staat,
-- met Row Level Security zodat iedereen alleen bij zijn eigen gegevens kan.

create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

-- Elke gebruiker mag uitsluitend zijn eigen rij lezen en schrijven.
drop policy if exists "own data select" on public.user_data;
create policy "own data select" on public.user_data
  for select using (auth.uid() = user_id);

drop policy if exists "own data insert" on public.user_data;
create policy "own data insert" on public.user_data
  for insert with check (auth.uid() = user_id);

drop policy if exists "own data update" on public.user_data;
create policy "own data update" on public.user_data
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own data delete" on public.user_data;
create policy "own data delete" on public.user_data
  for delete using (auth.uid() = user_id);
