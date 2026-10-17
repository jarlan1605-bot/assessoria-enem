-- =====================================================================
-- Mentoria ENEM — ONDE ESTÃO SEUS PONTOS (respostas do "Pergunte ao Claude")
-- Pode rodar de novo sem problema. Só ACRESCENTA coisas.
-- =====================================================================

create table if not exists public.sugestoes_estudo (
  id          uuid primary key default gen_random_uuid(),
  aluno_id    uuid not null references public.perfis (id) on delete cascade,
  pedido_por  uuid references public.perfis (id) on delete set null default auth.uid(),
  pergunta    text not null default '' check (char_length(pergunta) <= 500),
  resposta    text not null default '',
  criado_em   timestamptz not null default now()
);
create index if not exists sugestoes_estudo_aluno_idx on public.sugestoes_estudo (aluno_id, criado_em desc);

alter table public.sugestoes_estudo enable row level security;

-- O aluno, o mentor dele e o CEO veem; as respostas são gravadas pela função do site
-- em nome de quem perguntou (o limite de perguntas por dia fica na função).
drop policy if exists "sugestoes_estudo: ver" on public.sugestoes_estudo;
create policy "sugestoes_estudo: ver" on public.sugestoes_estudo
  for select using (public.pode_ver_aluno(aluno_id));

drop policy if exists "sugestoes_estudo: criar" on public.sugestoes_estudo;
create policy "sugestoes_estudo: criar" on public.sugestoes_estudo
  for insert with check (public.pode_ver_aluno(aluno_id) and pedido_por = auth.uid());

drop policy if exists "sugestoes_estudo: apagar" on public.sugestoes_estudo;
create policy "sugestoes_estudo: apagar" on public.sugestoes_estudo
  for delete using (public.pode_gerir_aluno(aluno_id));
