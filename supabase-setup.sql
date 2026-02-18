-- Pizarrón: tabla para sincronizar tarjetas en tiempo real
-- Ejecutar en Supabase → SQL Editor

create table if not exists public.pizarron_cards (
  room_id text not null,
  card_id text not null,
  content text,
  type text not null default 'code',
  meta jsonb default '{}',
  left_pos int default 0,
  top_pos int default 0,
  created_at timestamptz default now(),
  primary key (room_id, card_id)
);

-- Necesario para que Realtime envíe el registro completo en DELETE/UPDATE
alter table public.pizarron_cards replica identity full;

-- Activar Realtime para esta tabla (si al ejecutar da "already member", ignóralo)
alter publication supabase_realtime add table public.pizarron_cards;

-- RLS: permite leer/escribir con la anon key (en producción puedes restringir por room/session)
alter table public.pizarron_cards enable row level security;
drop policy if exists "Allow all for pizarron" on public.pizarron_cards;
create policy "Allow all for pizarron" on public.pizarron_cards for all using (true) with check (true);
