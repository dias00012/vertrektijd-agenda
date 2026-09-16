-- Vertrektijd-agenda — tabel voor de Claude-connector.
--
-- Draai dit één keer in je Supabase-project, ná `schema.sql`:
--   Supabase dashboard -> SQL Editor -> New query -> plak dit -> Run.
--
-- Hierin staat per gebruiker welke connector-tokens er zijn. Niet het token
-- zelf: alleen de SHA-256 ervan. De leesbare vorm bestaat maar één keer, op het
-- scherm waar je hem aanmaakt. Raakt deze tabel ooit op straat, dan ligt
-- daarmee niemands agenda open.

create table if not exists public.connector_tokens (
  token_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Zelfgekozen naam, zodat je weet welke je intrekt: "laptop", "telefoon".
  label text not null default '',
  created_at timestamptz not null default now(),
  -- Wanneer er voor het laatst mee is gelezen of geschreven. Staat hier zodat
  -- je een token dat je niet herkent kunt herkennen aan het feit dat het leeft.
  last_used_at timestamptz
);

create index if not exists connector_tokens_user_idx
  on public.connector_tokens (user_id);

-- Aan, en bewust zonder policies: alleen de service-sleutel mag hierbij, en die
-- staat uitsluitend op de server. De browser praat via /api/connector/token.
alter table public.connector_tokens enable row level security;
