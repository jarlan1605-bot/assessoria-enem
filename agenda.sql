-- =====================================================================
-- Mentoria ENEM — AGENDA DE ATENDIMENTOS (atualização)
-- Rode este arquivo UMA vez no Supabase: SQL Editor > New query > Run.
-- Ele só ACRESCENTA coisas: não apaga horários, simulados nem alunos.
-- =====================================================================

-- 1) Limite de atendimentos por mês de cada aluno (padrão: 4)
alter table public.perfis
  add column if not exists limite_mensal smallint not null default 4
  check (limite_mensal between 0 and 60);

-- 2) ATENDIMENTOS: cada linha é um horário que o mentor abriu.
--    aluno_id vazio = horário livre; preenchido = reservado por esse aluno.
create table if not exists public.atendimentos (
  id            uuid primary key default gen_random_uuid(),
  inicio        timestamptz not null,
  duracao_min   smallint not null default 60 check (duracao_min between 15 and 240),
  aluno_id      uuid references public.perfis (id) on delete set null,
  tema          text not null default '',
  reservado_em  timestamptz,
  criado_em     timestamptz not null default now()
);
create index if not exists atendimentos_inicio_idx on public.atendimentos (inicio);
create index if not exists atendimentos_aluno_idx  on public.atendimentos (aluno_id);

alter table public.atendimentos enable row level security;

-- Quem vê o quê:
--   mentor: tudo
--   aluno: os próprios atendimentos + horários livres que ainda não passaram
--          (não vê os atendimentos dos outros alunos)
drop policy if exists "atendimentos: ver" on public.atendimentos;
create policy "atendimentos: ver" on public.atendimentos
  for select using (
    public.eh_mentor()
    or aluno_id = auth.uid()
    or (aluno_id is null and inicio > now())
  );

-- Só o mentor cria, altera e apaga diretamente.
-- O aluno reserva e cancela pelas funções abaixo, que conferem as regras.
drop policy if exists "atendimentos: mentor cria" on public.atendimentos;
create policy "atendimentos: mentor cria" on public.atendimentos
  for insert with check (public.eh_mentor());

drop policy if exists "atendimentos: mentor edita" on public.atendimentos;
create policy "atendimentos: mentor edita" on public.atendimentos
  for update using (public.eh_mentor()) with check (public.eh_mentor());

drop policy if exists "atendimentos: mentor apaga" on public.atendimentos;
create policy "atendimentos: mentor apaga" on public.atendimentos
  for delete using (public.eh_mentor());

-- 3) RESERVAR: confere se o horário está livre, se não passou
--    e se o aluno ainda tem atendimentos disponíveis no mês daquele horário.
create or replace function public.reservar_atendimento(p_id uuid, p_tema text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inicio  timestamptz;
  v_limite  int;
  v_usados  int;
begin
  if auth.uid() is null then
    raise exception 'Sua sessão expirou. Entre de novo.';
  end if;

  -- trava o perfil para duas reservas simultâneas não furarem o limite
  select limite_mensal into v_limite from public.perfis where id = auth.uid() for update;
  if not found then
    raise exception 'Cadastro não encontrado. Fale com seu mentor.';
  end if;

  select inicio into v_inicio
  from public.atendimentos
  where id = p_id and aluno_id is null
  for update;
  if not found then
    raise exception 'Esse horário acabou de ser reservado. Escolha outro.';
  end if;
  if v_inicio <= now() then
    raise exception 'Esse horário já passou.';
  end if;

  select count(*) into v_usados
  from public.atendimentos
  where aluno_id = auth.uid()
    and date_trunc('month', inicio at time zone 'America/Fortaleza')
      = date_trunc('month', v_inicio at time zone 'America/Fortaleza');

  if v_usados >= v_limite then
    raise exception 'Você já usou os % atendimentos deste mês.', v_limite;
  end if;

  update public.atendimentos
  set aluno_id = auth.uid(),
      tema = left(coalesce(p_tema, ''), 200),
      reservado_em = now()
  where id = p_id;
end;
$$;

-- 4) CANCELAR: o aluno pode desmarcar com pelo menos 12 horas de antecedência.
--    (Para mudar o prazo, troque '12 hours' e rode só esta função de novo.)
create or replace function public.cancelar_atendimento(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inicio timestamptz;
begin
  select inicio into v_inicio
  from public.atendimentos
  where id = p_id and aluno_id = auth.uid()
  for update;
  if not found then
    raise exception 'Atendimento não encontrado.';
  end if;
  if v_inicio - now() < interval '12 hours' then
    raise exception 'Só dá para cancelar com pelo menos 12 horas de antecedência. Fale com seu mentor.';
  end if;

  update public.atendimentos
  set aluno_id = null, tema = '', reservado_em = null
  where id = p_id;
end;
$$;

revoke execute on function public.reservar_atendimento(uuid, text) from public, anon;
revoke execute on function public.cancelar_atendimento(uuid) from public, anon;
grant execute on function public.reservar_atendimento(uuid, text) to authenticated;
grant execute on function public.cancelar_atendimento(uuid) to authenticated;
