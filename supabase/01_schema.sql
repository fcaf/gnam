-- =====================================================================
--  GNAM · Gusti Nostri, Archivio Multimediale
--  Schema del database Supabase
--  Come usarlo: Supabase > SQL Editor > New query > incolla tutto > Run
--  Si può rieseguire senza danni: crea solo ciò che manca.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. PROFILI (uno per ogni persona di famiglia)
-- ---------------------------------------------------------------------
create table if not exists public.profili (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text,
  email      text,
  is_admin   boolean not null default false,
  creato_il  timestamptz not null default now()
);

-- Il primo utente che entra diventa amministratore; gli altri no.
create or replace function public.gestisci_nuovo_utente()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profili (id, email, nome, is_admin)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'nome', ''), split_part(new.email, '@', 1)),
    not exists (select 1 from public.profili where is_admin)
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.gestisci_nuovo_utente();

-- Profili per eventuali utenti già esistenti prima di questo script
insert into public.profili (id, email, nome, is_admin)
select u.id, u.email, split_part(u.email, '@', 1), false
from auth.users u
where not exists (select 1 from public.profili p where p.id = u.id);

update public.profili set is_admin = true
where id = (select id from public.profili order by creato_il limit 1)
  and not exists (select 1 from public.profili where is_admin);

create or replace function public.sono_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profili where id = auth.uid()), false)
$$;

-- L'amministratore può nominare o togliere altri amministratori
create or replace function public.imposta_admin(utente uuid, valore boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sono_admin() then
    raise exception 'Solo un amministratore può farlo';
  end if;
  if utente = auth.uid() and valore = false then
    raise exception 'Non puoi togliere a te stesso il ruolo di amministratore';
  end if;
  update public.profili set is_admin = valore where id = utente;
end $$;

-- ---------------------------------------------------------------------
-- 2. RICETTE
-- ---------------------------------------------------------------------
create table if not exists public.ricette (
  id               uuid primary key default gen_random_uuid(),
  autore_id        uuid not null default auth.uid() references public.profili(id) on delete cascade,
  titolo           text not null check (char_length(titolo) between 1 and 200),
  descrizione      text,
  categoria        text,
  tag              text[] not null default '{}',
  porzioni         int check (porzioni is null or porzioni > 0),
  tempo_prep       int check (tempo_prep is null or tempo_prep >= 0),      -- minuti
  tempo_cottura    int check (tempo_cottura is null or tempo_cottura >= 0),
  tempo_riposo     int check (tempo_riposo is null or tempo_riposo >= 0),
  difficolta       smallint check (difficolta between 1 and 3),           -- 1 facile, 2 media, 3 impegnativa
  costo            smallint check (costo between 1 and 3),                -- 1 basso, 2 medio, 3 alto
  ingredienti      jsonb not null default '[]',  -- [{sezione}|{quantita,unita,nome,nota}]
  passi            jsonb not null default '[]',  -- ["testo passo 1", "testo passo 2", ...]
  note             text,
  fonte_tipo       text not null default 'manuale'
                   check (fonte_tipo in ('manuale','video','foto','web','testo')),
  fonte_url        text,
  fonte_autore     text,
  lingua_originale text,
  testo_originale  text,                         -- trascrizione / testo letto dall'IA
  foto_path        text,                         -- foto del piatto (storage)
  foto_originali   text[] not null default '{}', -- foto degli appunti (storage)
  privata          boolean not null default false,
  creata_il        timestamptz not null default now(),
  aggiornata_il    timestamptz not null default now()
);

create index if not exists ricette_creata_idx on public.ricette (creata_il desc);
create index if not exists ricette_tag_idx on public.ricette using gin (tag);

create or replace function public.tocca_aggiornata()
returns trigger language plpgsql as $$
begin
  new.aggiornata_il := now();
  new.autore_id := old.autore_id;  -- l'autore non cambia mai
  return new;
end $$;

drop trigger if exists ricette_aggiornata on public.ricette;
create trigger ricette_aggiornata before update on public.ricette
  for each row execute function public.tocca_aggiornata();

-- ---------------------------------------------------------------------
-- 3. PREFERITE E VOTI (personali)
-- ---------------------------------------------------------------------
create table if not exists public.ricette_utente (
  utente_id  uuid not null default auth.uid() references public.profili(id) on delete cascade,
  ricetta_id uuid not null references public.ricette(id) on delete cascade,
  preferita  boolean not null default false,
  voto       smallint check (voto between 1 and 5),
  primary key (utente_id, ricetta_id)
);

-- ---------------------------------------------------------------------
-- 4. LISTA DELLA SPESA (condivisa dalla famiglia)
-- ---------------------------------------------------------------------
create table if not exists public.lista_spesa (
  id             uuid primary key default gen_random_uuid(),
  voce           text not null,
  quantita       numeric,
  unita          text,
  ricetta_id     uuid references public.ricette(id) on delete set null,
  ricetta_titolo text,
  fatto          boolean not null default false,
  aggiunto_da    uuid default auth.uid() references public.profili(id) on delete set null,
  creato_il      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. SICUREZZA (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.profili        enable row level security;
alter table public.ricette        enable row level security;
alter table public.ricette_utente enable row level security;
alter table public.lista_spesa    enable row level security;

-- Profili: tutti i familiari si vedono; ognuno cambia solo il proprio nome
drop policy if exists profili_leggi on public.profili;
create policy profili_leggi on public.profili for select to authenticated using (true);
drop policy if exists profili_modifica on public.profili;
create policy profili_modifica on public.profili for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profili from authenticated;
grant update (nome) on public.profili to authenticated;

-- Ricette: si vedono quelle condivise e le proprie private
drop policy if exists ricette_leggi on public.ricette;
create policy ricette_leggi on public.ricette for select to authenticated
  using (privata = false or autore_id = auth.uid());
drop policy if exists ricette_crea on public.ricette;
create policy ricette_crea on public.ricette for insert to authenticated
  with check (autore_id = auth.uid());
drop policy if exists ricette_modifica on public.ricette;
create policy ricette_modifica on public.ricette for update to authenticated
  using (autore_id = auth.uid() or (public.sono_admin() and privata = false))
  with check (autore_id = auth.uid() or public.sono_admin());
drop policy if exists ricette_elimina on public.ricette;
create policy ricette_elimina on public.ricette for delete to authenticated
  using (autore_id = auth.uid() or (public.sono_admin() and privata = false));

-- Preferite e voti: ognuno gestisce i propri; i voti si leggono per la media
drop policy if exists ru_leggi on public.ricette_utente;
create policy ru_leggi on public.ricette_utente for select to authenticated using (true);
drop policy if exists ru_scrivi on public.ricette_utente;
create policy ru_scrivi on public.ricette_utente for all to authenticated
  using (utente_id = auth.uid()) with check (utente_id = auth.uid());

-- Lista della spesa: condivisa
drop policy if exists spesa_tutto on public.lista_spesa;
create policy spesa_tutto on public.lista_spesa for all to authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------
-- 6. ARCHIVIO FOTO (Storage, privato)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ricette', 'ricette', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists foto_leggi on storage.objects;
create policy foto_leggi on storage.objects for select to authenticated
  using (bucket_id = 'ricette');
drop policy if exists foto_carica on storage.objects;
create policy foto_carica on storage.objects for insert to authenticated
  with check (bucket_id = 'ricette' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists foto_modifica on storage.objects;
create policy foto_modifica on storage.objects for update to authenticated
  using (bucket_id = 'ricette' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists foto_elimina on storage.objects;
create policy foto_elimina on storage.objects for delete to authenticated
  using (bucket_id = 'ricette' and ((storage.foldername(name))[1] = auth.uid()::text or public.sono_admin()));
