-- =====================================================================
-- Mentoria ENEM — COMUNIDADE (avisos, simulados e materiais)
-- Rode este arquivo UMA vez no Supabase: SQL Editor > New query > Run.
-- Ele só ACRESCENTA coisas: não apaga nada do que já existe.
-- =====================================================================

create table if not exists public.avisos (
  id         uuid primary key default gen_random_uuid(),
  titulo     text not null check (char_length(titulo) between 1 and 160),
  texto      text not null default '',
  tipo       text not null default 'aviso' check (tipo in ('aviso', 'simulado', 'material', 'evento')),
  link       text not null default '',
  fixado     boolean not null default false,
  anexos     jsonb not null default '[]'::jsonb,  -- [{nome, caminho, tamanho, tipo}]
  criado_em  timestamptz not null default now(),
  editado_em timestamptz
);
create index if not exists avisos_criado_idx on public.avisos (fixado desc, criado_em desc);

alter table public.avisos enable row level security;

-- Todo mundo que está logado lê; só o mentor publica, edita e apaga.
drop policy if exists "avisos: ver" on public.avisos;
create policy "avisos: ver" on public.avisos
  for select using (auth.uid() is not null);

drop policy if exists "avisos: mentor cria" on public.avisos;
create policy "avisos: mentor cria" on public.avisos
  for insert with check (public.eh_mentor());

drop policy if exists "avisos: mentor edita" on public.avisos;
create policy "avisos: mentor edita" on public.avisos
  for update using (public.eh_mentor()) with check (public.eh_mentor());

drop policy if exists "avisos: mentor apaga" on public.avisos;
create policy "avisos: mentor apaga" on public.avisos
  for delete using (public.eh_mentor());

-- Pasta de anexos (PRIVADA: só quem está logado no site consegue baixar).
-- Limite de 25 MB por arquivo.
insert into storage.buckets (id, name, public, file_size_limit)
values ('comunidade', 'comunidade', false, 26214400)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;

drop policy if exists "comunidade: alunos baixam" on storage.objects;
create policy "comunidade: alunos baixam" on storage.objects
  for select to authenticated
  using (bucket_id = 'comunidade');

drop policy if exists "comunidade: mentor envia" on storage.objects;
create policy "comunidade: mentor envia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'comunidade' and public.eh_mentor());

drop policy if exists "comunidade: mentor altera" on storage.objects;
create policy "comunidade: mentor altera" on storage.objects
  for update to authenticated
  using (bucket_id = 'comunidade' and public.eh_mentor())
  with check (bucket_id = 'comunidade' and public.eh_mentor());

drop policy if exists "comunidade: mentor apaga" on storage.objects;
create policy "comunidade: mentor apaga" on storage.objects
  for delete to authenticated
  using (bucket_id = 'comunidade' and public.eh_mentor());
