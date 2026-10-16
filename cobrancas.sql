-- =====================================================================
-- Mentoria ENEM — COBRANÇA MENSAL (ciclo de 1 mês a partir do último pagamento)
-- Rode depois de extras.sql. Pode rodar de novo sem problema. Não apaga nada.
-- =====================================================================

-- Cada aluno tem o seu próximo vencimento (um mês depois do último pagamento)
alter table public.contratos add column if not exists proximo_vencimento date;
alter table public.contratos add column if not exists ativo boolean not null default true;

-- Histórico de pagamentos: usa a tabela mensalidades (um registro por ciclo pago)
alter table public.mensalidades add column if not exists registrado_em timestamptz not null default now();

-- Quem já tinha cobranças do jeito antigo: o próximo vencimento sai do histórico
update public.contratos c set proximo_vencimento = coalesce(
  (select (max(m.vencimento) + interval '1 month')::date from public.mensalidades m where m.aluno_id = c.aluno_id and m.pago_em is not null),
  (select min(m.vencimento) from public.mensalidades m where m.aluno_id = c.aluno_id and m.pago_em is null)
)
where c.proximo_vencimento is null;

-- Configurações da cobrança (só o CEO vê): Pix e mensagens
create table if not exists public.financeiro_config (
  id            smallint primary key default 1 check (id = 1),
  pix_chave     text not null default '',
  pix_nome      text not null default '',
  pix_cidade    text not null default '',
  dias_antes    smallint not null default 3 check (dias_antes between 0 and 15),
  msg_lembrete  text not null default '',
  msg_hoje      text not null default '',
  msg_atraso    text not null default ''
);
insert into public.financeiro_config (id) values (1) on conflict (id) do nothing;
alter table public.financeiro_config enable row level security;
drop policy if exists "financeiro_config: ceo" on public.financeiro_config;
create policy "financeiro_config: ceo" on public.financeiro_config for all using (public.eh_ceo()) with check (public.eh_ceo());

alter table public.financeiro_config add column if not exists pix_tipo text not null default 'telefone';
alter table public.contratos add column if not exists ultimo_aviso date;
-- o dia do vencimento pode ser qualquer dia do mês (29, 30, 31 caem no último dia nos meses mais curtos)
alter table public.contratos drop constraint if exists contratos_dia_vencimento_check;
alter table public.contratos add constraint contratos_dia_vencimento_check check (dia_vencimento between 1 and 31);
