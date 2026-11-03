-- =====================================================================
-- Assessoria J&C — INSCRIÇÃO COM PAGAMENTO (Mercado Pago)
-- O formulário da página cria a inscrição e manda o aluno para o pagamento.
-- Com o pagamento aprovado, o aluno escolhe o assessor e o site cria a conta dele.
-- Pode rodar de novo sem problema. Rode depois de interessados.sql.
-- =====================================================================

alter table public.interessados add column if not exists valor numeric(10,2);
alter table public.interessados add column if not exists pago boolean not null default false;
alter table public.interessados add column if not exists pago_em timestamptz;
alter table public.interessados add column if not exists mp_preferencia text not null default '';
alter table public.interessados add column if not exists mp_pagamento text not null default '';
alter table public.interessados add column if not exists link_pagamento text not null default '';
alter table public.interessados add column if not exists mentor_id uuid references public.perfis (id) on delete set null;
alter table public.interessados add column if not exists aluno_id uuid references public.perfis (id) on delete set null;
create index if not exists interessados_pago_idx on public.interessados (pago, criado_em desc);
