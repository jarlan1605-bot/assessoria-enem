-- =====================================================================
-- Mentoria ENEM — HORÁRIO POR MÊS + OBSERVAÇÕES
-- Cada bloco do horário pertence a um mês: montar o de novembro não apaga o de outubro.
-- Os blocos que já existem ficam no mês em que este arquivo for rodado.
-- Pode rodar de novo sem problema. Rode depois de acesso.sql.
-- =====================================================================

alter table public.horarios add column if not exists mes date;
update public.horarios set mes = date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date where mes is null;
alter table public.horarios alter column mes set default date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
alter table public.horarios alter column mes set not null;
alter table public.horarios drop constraint if exists horarios_mes_dia_1;
alter table public.horarios add constraint horarios_mes_dia_1 check (extract(day from mes) = 1);
create index if not exists horarios_aluno_mes_idx on public.horarios (aluno_id, mes);

-- Observações do horário de cada mês (o mentor escreve, o aluno lê)
create table if not exists public.horario_observacoes (
  aluno_id      uuid not null references public.perfis (id) on delete cascade,
  mes           date not null check (extract(day from mes) = 1),
  texto         text not null default '' check (char_length(texto) <= 4000),
  atualizado_em timestamptz not null default now(),
  primary key (aluno_id, mes)
);
alter table public.horario_observacoes enable row level security;

drop policy if exists "horario_obs: ver" on public.horario_observacoes;
create policy "horario_obs: ver" on public.horario_observacoes
  for select using (public.pode_ver_aluno(aluno_id));

drop policy if exists "horario_obs: criar" on public.horario_observacoes;
create policy "horario_obs: criar" on public.horario_observacoes
  for insert with check (public.pode_gerir_aluno(aluno_id));

drop policy if exists "horario_obs: editar" on public.horario_observacoes;
create policy "horario_obs: editar" on public.horario_observacoes
  for update using (public.pode_gerir_aluno(aluno_id)) with check (public.pode_gerir_aluno(aluno_id));

drop policy if exists "horario_obs: apagar" on public.horario_observacoes;
create policy "horario_obs: apagar" on public.horario_observacoes
  for delete using (public.pode_gerir_aluno(aluno_id));
