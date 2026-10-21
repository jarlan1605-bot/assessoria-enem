-- =====================================================================
-- Mentoria ENEM — SIMULADOS E PROVAS (biblioteca ligada ao Google Drive)
-- Cada linha é um PDF que continua guardado no Drive. O site só mostra
-- o catálogo e abre o arquivo dentro da página.
-- Pode rodar de novo sem problema. Rode depois de equipe.sql.
-- =====================================================================

create table if not exists public.materiais (
  id         uuid primary key default gen_random_uuid(),
  drive_id   text not null unique check (char_length(drive_id) between 10 and 120),
  titulo     text not null check (char_length(titulo) between 1 and 200),
  editora    text not null default '',          -- SAS, Bernoulli, Poliedro, Somos...
  exame      text not null default 'ENEM',      -- ENEM, UNICAMP, FUVEST...
  ano        smallint check (ano between 2000 and 2100),
  simulado   text not null default '',          -- 1º simulado, Ciclo 3, Abril...
  ordem      smallint not null default 99,
  subpasta   text not null default '',
  tipo       text not null default 'prova' check (tipo in ('prova', 'gabarito', 'resolucao', 'redacao', 'material')),
  dia        smallint check (dia in (1, 2)),
  criado_em  timestamptz not null default now()
);
create index if not exists materiais_filtros_idx on public.materiais (exame, ano, editora);
alter table public.materiais enable row level security;

-- Quem está logado vê (aluno suspenso não entra no site); só o CEO cadastra, edita e apaga
drop policy if exists "materiais: ver" on public.materiais;
create policy "materiais: ver" on public.materiais for select using (auth.uid() is not null);

drop policy if exists "materiais: ceo" on public.materiais;
create policy "materiais: ceo" on public.materiais for all using (public.eh_ceo()) with check (public.eh_ceo());
