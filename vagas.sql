-- =====================================================================
-- Assessoria J&C — VAGAS POR ASSESSOR
-- Cada assessor tem o próprio número de vagas (só o CEO define, na aba Mentores).
-- Vaga ocupada = inscrição feita pelo site que escolheu aquele assessor.
-- Quando as vagas acabam, o assessor aparece como ESGOTADO e não pode mais ser escolhido.
-- Vagas em branco = sem limite. Pode rodar de novo sem problema. Rode depois de inscricao.sql.
-- =====================================================================

alter table public.perfis add column if not exists vagas integer check (vagas is null or vagas between 0 and 500);

-- quantas vagas cada assessor já tem ocupadas (inscrições do site com esse assessor)
create or replace function public.vagas_ocupadas(p_mentor uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.interessados where mentor_id = p_mentor;
$$;
revoke execute on function public.vagas_ocupadas(uuid) from public, anon;
grant execute on function public.vagas_ocupadas(uuid) to authenticated;

-- O que os visitantes veem de cada mentor (agora com vagas, ocupadas e esgotado)
drop function if exists public.mentores_publicos();
create function public.mentores_publicos()
returns table (id uuid, nome text, foto_url text, papel text, idade int, naturalidade text, caracteristicas text[], legenda text,
               disponivel boolean, aprovacao text, questoes_feitas int, especialidade text, vagas int, ocupadas int, esgotado boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.nome, p.foto_url, p.papel,
         case when p.nascimento is null then null else extract(year from age(p.nascimento))::int end,
         p.naturalidade, p.caracteristicas, p.legenda, p.disponivel, p.aprovacao, p.questoes_feitas, p.especialidade,
         p.vagas, o.n, (not p.disponivel) or (p.vagas is not null and o.n >= p.vagas)
  from public.perfis p
  cross join lateral (select count(*)::int as n from public.interessados i where i.mentor_id = p.id) o
  where p.papel in ('mentor', 'ceo') and p.vitrine
  order by (p.papel = 'ceo') desc, p.criado_em;
$$;
revoke execute on function public.mentores_publicos() from public;
grant execute on function public.mentores_publicos() to anon, authenticated;

-- Assessor escolhido no botão "Quero estudar com..." antes do pagamento (vira a escolha automática depois de pagar)
alter table public.interessados add column if not exists mentor_preferido uuid references public.perfis (id) on delete set null;
create index if not exists interessados_email_idx on public.interessados (lower(email));
