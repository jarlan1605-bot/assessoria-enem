-- =====================================================================
-- Mentoria ENEM — PIX COM BAIXA AUTOMÁTICA (Mercado Pago)
-- Cada linha é um Pix gerado no Mercado Pago para uma mensalidade.
-- Quando o aluno paga, o Mercado Pago avisa o site, que registra o pagamento
-- em mensalidades e passa o vencimento para o mês seguinte.
-- Pode rodar de novo sem problema. Rode depois de cobrancas.sql.
-- =====================================================================

create table if not exists public.cobrancas_pix (
  id          uuid primary key default gen_random_uuid(),
  aluno_id    uuid not null references public.perfis (id) on delete cascade,
  vencimento  date not null,
  valor       numeric(10,2) not null,
  mp_id       text not null unique,
  copia_cola  text not null default '',
  qr_base64   text not null default '',
  link        text not null default '',
  status      text not null default 'pendente' check (status in ('pendente', 'pago', 'expirado', 'cancelado')),
  expira_em   timestamptz,
  pago_em     timestamptz,
  criado_em   timestamptz not null default now()
);
create index if not exists cobrancas_pix_aluno_idx on public.cobrancas_pix (aluno_id, vencimento, criado_em desc);
alter table public.cobrancas_pix enable row level security;

-- O aluno vê os próprios Pix; o CEO vê todos. Só o servidor (chave secreta) cria e atualiza.
drop policy if exists "cobrancas_pix: ver" on public.cobrancas_pix;
create policy "cobrancas_pix: ver" on public.cobrancas_pix for select using (aluno_id = auth.uid() or public.eh_ceo());
