-- =====================================================================
-- Mentoria ENEM — MINHA TRILHA (checklist de conteúdos por matéria)
-- Uma linha por aluno e conteúdo: progresso de 0 a 100, quando viu,
-- como se sentiu, questões feitas e certas, anotação.
-- Os conteúdos em si ficam no arquivo conteudos.js do site.
-- Pode rodar de novo sem problema. Rode depois de horario_meses.sql.
-- =====================================================================

create table if not exists public.trilha_conteudos (
  aluno_id        uuid not null references public.perfis (id) on delete cascade,
  conteudo        text not null check (char_length(conteudo) between 1 and 120),
  progresso       smallint not null default 0 check (progresso between 0 and 100),
  visto_em        date,
  sentimento      smallint check (sentimento between 1 and 5),
  questoes_feitas integer not null default 0 check (questoes_feitas between 0 and 100000),
  questoes_certas integer not null default 0 check (questoes_certas >= 0 and questoes_certas <= questoes_feitas),
  anotacao        text not null default '' check (char_length(anotacao) <= 2000),
  atualizado_em   timestamptz not null default now(),
  primary key (aluno_id, conteudo)
);
alter table public.trilha_conteudos enable row level security;

-- O aluno atualiza a própria trilha; o mentor dele e o CEO também veem e podem ajustar.
-- Aluno suspenso não acessa (pode_ver_aluno já cuida disso).
drop policy if exists "trilha: tudo" on public.trilha_conteudos;
create policy "trilha: tudo" on public.trilha_conteudos
  for all using (public.pode_ver_aluno(aluno_id)) with check (public.pode_ver_aluno(aluno_id));
