-- =====================================================================
-- Mentoria ENEM — COBRANÇA AUTOMÁTICA PELO WHATSAPP
-- Rode depois de cobrancas.sql. Pode rodar de novo sem problema.
-- =====================================================================

alter table public.financeiro_config add column if not exists auto_ativo boolean not null default false;
alter table public.financeiro_config add column if not exists atraso_dias smallint not null default 3;
alter table public.financeiro_config add column if not exists tpl_lembrete text not null default 'lembrete_mensalidade';
alter table public.financeiro_config add column if not exists tpl_hoje text not null default 'mensalidade_vence_hoje';
alter table public.financeiro_config add column if not exists tpl_atraso text not null default 'mensalidade_em_aberto';
alter table public.financeiro_config add column if not exists tpl_idioma text not null default 'pt_BR';

-- Registro de cada mensagem automática (uma por aluno, vencimento e tipo: nunca manda repetido)
create table if not exists public.envios_whatsapp (
  id          uuid primary key default gen_random_uuid(),
  aluno_id    uuid not null references public.perfis (id) on delete cascade,
  vencimento  date not null,
  tipo        text not null check (tipo in ('lembrete', 'hoje', 'atraso')),
  telefone    text not null default '',
  status      text not null default 'enviando' check (status in ('enviando', 'enviado', 'erro')),
  erro        text not null default '',
  wamid       text not null default '',
  criado_em   timestamptz not null default now(),
  unique (aluno_id, vencimento, tipo)
);
create index if not exists envios_whatsapp_data_idx on public.envios_whatsapp (criado_em desc);
alter table public.envios_whatsapp enable row level security;
drop policy if exists "envios_whatsapp: ceo" on public.envios_whatsapp;
create policy "envios_whatsapp: ceo" on public.envios_whatsapp for all using (public.eh_ceo()) with check (public.eh_ceo());

-- quando o CEO cobrou pessoalmente (o robô usa ultimo_aviso; você usa aviso_pessoal)
alter table public.contratos add column if not exists aviso_pessoal date;
