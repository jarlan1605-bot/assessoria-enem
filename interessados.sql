-- =====================================================================
-- Mentoria ENEM — LISTA DE INTERESSE 2027
-- Formulário da página de apresentação: qualquer visitante envia,
-- só o CEO vê, marca o andamento e apaga.
-- Pode rodar de novo sem problema.
-- =====================================================================

create table if not exists public.interessados (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null check (char_length(trim(nome)) between 2 and 100),
  whatsapp     text not null check (char_length(whatsapp) between 8 and 20),
  email        text not null default '' check (char_length(email) <= 120),
  idade        smallint check (idade between 10 and 80),
  cidade       text not null default '' check (char_length(cidade) <= 80),
  situacao     text not null default '' check (char_length(situacao) <= 60),   -- 3º ano, já terminei...
  curso        text not null default '' check (char_length(curso) <= 80),
  dificuldade  text not null default '' check (char_length(dificuldade) <= 120),
  como_conheceu text not null default '' check (char_length(como_conheceu) <= 60),
  responsavel  text not null default '' check (char_length(responsavel) <= 100),
  mensagem     text not null default '' check (char_length(mensagem) <= 600),
  status       text not null default 'novo' check (status in ('novo', 'contatado', 'matriculado', 'desistiu')),
  anotacao     text not null default '' check (char_length(anotacao) <= 600),
  criado_em    timestamptz not null default now()
);
create index if not exists interessados_data_idx on public.interessados (criado_em desc);
alter table public.interessados enable row level security;

-- Visitante (sem login) só consegue ENVIAR, sempre como "novo"; não lê nada
drop policy if exists "interessados: enviar" on public.interessados;
create policy "interessados: enviar" on public.interessados
  for insert to anon, authenticated with check (status = 'novo' and anotacao = '');
grant insert on public.interessados to anon;

-- O CEO vê, atualiza e apaga
drop policy if exists "interessados: ceo" on public.interessados;
create policy "interessados: ceo" on public.interessados
  for all using (public.eh_ceo()) with check (public.eh_ceo());
