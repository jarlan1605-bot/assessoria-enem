-- =====================================================================
-- Mentoria ENEM — BANCO DE QUESTÕES
-- Antes, rode (se ainda não rodou): agenda, perfil, comunidade, equipe, extras e detalhes.
-- Depois rode ESTE arquivo UMA vez: SQL Editor > New query > Run.
-- Não apaga nada.
-- =====================================================================

create table if not exists public.questoes (
  id            uuid primary key default gen_random_uuid(),
  banca         text not null default 'ENEM/Inep',
  prova         text not null default '',          -- ex.: "ENEM 2023 — 2º dia — Caderno Azul"
  ano           smallint,
  numero        smallint,
  area          text not null check (area in ('linguagens', 'humanas', 'natureza', 'matematica')),
  materia       text not null default '',
  assunto       text not null default '',
  dificuldade   text not null default 'media' check (dificuldade in ('facil', 'media', 'dificil')),
  enunciado     text not null default '',
  imagens       jsonb not null default '[]'::jsonb,  -- ["https://..."] na ordem em que aparecem
  alternativas  jsonb not null default '{}'::jsonb,  -- {"A": "...", "B": "...", ...}
  gabarito      char(1) check (gabarito in ('A', 'B', 'C', 'D', 'E')),  -- vazio = questão anulada
  comentario    text not null default '',
  revisado      boolean not null default false,       -- conferido por um mentor
  fonte_url     text not null default '',
  autor_id      uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists questoes_prova_numero_idx on public.questoes (prova, numero);
create index if not exists questoes_filtros_idx on public.questoes (area, materia, ano);

create or replace function public.carimbar_questao()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;
drop trigger if exists carimbar_questao on public.questoes;
create trigger carimbar_questao before update on public.questoes
  for each row execute function public.carimbar_questao();

alter table public.questoes enable row level security;
drop policy if exists "questoes: todos leem" on public.questoes;
create policy "questoes: todos leem" on public.questoes for select using (auth.uid() is not null);
drop policy if exists "questoes: mentores editam" on public.questoes;
create policy "questoes: mentores editam" on public.questoes for all
  using (public.eh_mentor()) with check (public.eh_mentor());

-- Respostas dos alunos (a correção é feita pelo banco, não dá para "se dar" acerto)
create table if not exists public.respostas (
  id           uuid primary key default gen_random_uuid(),
  aluno_id     uuid not null references public.perfis (id) on delete cascade default auth.uid(),
  questao_id   uuid not null references public.questoes (id) on delete cascade,
  alternativa  char(1) not null check (alternativa in ('A', 'B', 'C', 'D', 'E')),
  correta      boolean not null default false,
  tempo_seg    integer,
  criado_em    timestamptz not null default now()
);
create index if not exists respostas_aluno_idx on public.respostas (aluno_id, questao_id);
create index if not exists respostas_questao_idx on public.respostas (questao_id);

create or replace function public.corrigir_resposta()
returns trigger language plpgsql security definer set search_path = public as $$
declare g char(1);
begin
  select gabarito into g from public.questoes where id = new.questao_id;
  new.correta := (g is not null and new.alternativa = g);
  return new;
end;
$$;
drop trigger if exists corrigir_resposta on public.respostas;
create trigger corrigir_resposta before insert or update on public.respostas
  for each row execute function public.corrigir_resposta();

alter table public.respostas enable row level security;
drop policy if exists "respostas: ver" on public.respostas;
create policy "respostas: ver" on public.respostas for select using (public.pode_ver_aluno(aluno_id));
drop policy if exists "respostas: responder" on public.respostas;
create policy "respostas: responder" on public.respostas for insert with check (aluno_id = auth.uid());
drop policy if exists "respostas: apagar" on public.respostas;
create policy "respostas: apagar" on public.respostas for delete using (aluno_id = auth.uid() or public.pode_gerir_aluno(aluno_id));

-- Caderno de erros: lembrar de qual questão do banco o erro veio
alter table public.erros add column if not exists questao_id uuid references public.questoes (id) on delete set null;

-- Imagens das questões (gráficos, figuras): leitura pública, só a equipe envia
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('questoes', 'questoes', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update set public = true;
drop policy if exists "questoes: equipe envia" on storage.objects;
create policy "questoes: equipe envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'questoes' and public.eh_mentor());
drop policy if exists "questoes: equipe altera" on storage.objects;
create policy "questoes: equipe altera" on storage.objects for update to authenticated
  using (bucket_id = 'questoes' and public.eh_mentor()) with check (bucket_id = 'questoes' and public.eh_mentor());
drop policy if exists "questoes: equipe apaga" on storage.objects;
create policy "questoes: equipe apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'questoes' and public.eh_mentor());
drop policy if exists "questoes: equipe lista" on storage.objects;
create policy "questoes: equipe lista" on storage.objects for select to authenticated
  using (bucket_id = 'questoes' and public.eh_mentor());
