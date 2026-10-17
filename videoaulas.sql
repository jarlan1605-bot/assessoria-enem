-- =====================================================================
-- Mentoria ENEM — AULAS E MENTORIAS GRAVADAS (biblioteca de vídeos)
-- Rode depois de equipe.sql. Pode rodar de novo sem problema.
-- Ele só ACRESCENTA coisas: não apaga nada do que já existe.
-- =====================================================================

create table if not exists public.videoaulas (
  id         uuid primary key default gen_random_uuid(),
  titulo     text not null check (char_length(titulo) between 1 and 160),
  descricao  text not null default '',
  tipo       text not null default 'aula' check (tipo in ('aula', 'mentoria')),
  materia    text not null default '',
  link       text not null default '',  -- vídeo: YouTube, Vimeo, Google Drive, Loom ou outro
  material   text not null default '',  -- link opcional de material de apoio (PDF, slides)
  publicado  boolean not null default true,  -- false = rascunho, só a equipe vê
  autor_id   uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em  timestamptz not null default now(),
  editado_em timestamptz
);
create index if not exists videoaulas_criado_idx on public.videoaulas (criado_em desc);

alter table public.videoaulas enable row level security;

-- Mesma regra da Comunidade:
--   aula do CEO: todos os alunos veem
--   aula de um mentor: só os alunos dele (e o CEO) veem
--   rascunho: só quem criou (e o CEO)
drop policy if exists "videoaulas: ver" on public.videoaulas;
create policy "videoaulas: ver" on public.videoaulas
  for select using (
    auth.uid() is not null and (
      public.eh_ceo()
      or autor_id = auth.uid()
      or (publicado and (
        autor_id is null
        or public.papel_de(autor_id) = 'ceo'
        or autor_id = public.meu_mentor_id()
      ))
    )
  );

drop policy if exists "videoaulas: mentor cria" on public.videoaulas;
create policy "videoaulas: mentor cria" on public.videoaulas
  for insert with check (public.eh_mentor() and autor_id = auth.uid());

drop policy if exists "videoaulas: mentor edita" on public.videoaulas;
create policy "videoaulas: mentor edita" on public.videoaulas
  for update using (public.eh_ceo() or autor_id = auth.uid())
  with check (public.eh_ceo() or autor_id = auth.uid());

drop policy if exists "videoaulas: mentor apaga" on public.videoaulas;
create policy "videoaulas: mentor apaga" on public.videoaulas
  for delete using (public.eh_ceo() or autor_id = auth.uid());

-- Quais aulas cada aluno já assistiu (o aluno marca; o mentor dele e o CEO veem)
create table if not exists public.videoaulas_vistas (
  aluno_id  uuid not null references public.perfis (id) on delete cascade default auth.uid(),
  aula_id   uuid not null references public.videoaulas (id) on delete cascade,
  visto_em  timestamptz not null default now(),
  primary key (aluno_id, aula_id)
);

alter table public.videoaulas_vistas enable row level security;

drop policy if exists "videoaulas_vistas: ver" on public.videoaulas_vistas;
create policy "videoaulas_vistas: ver" on public.videoaulas_vistas
  for select using (public.pode_ver_aluno(aluno_id));

drop policy if exists "videoaulas_vistas: aluno marca" on public.videoaulas_vistas;
create policy "videoaulas_vistas: aluno marca" on public.videoaulas_vistas
  for insert with check (aluno_id = auth.uid());

drop policy if exists "videoaulas_vistas: aluno desmarca" on public.videoaulas_vistas;
create policy "videoaulas_vistas: aluno desmarca" on public.videoaulas_vistas
  for delete using (aluno_id = auth.uid());
