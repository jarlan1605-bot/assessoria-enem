-- =====================================================================
-- Mentoria ENEM — SUSPENDER ACESSO DE ALUNO (ex.: pagamento em atraso)
-- O login do aluno continua existindo, mas ele só vê o aviso de suspensão:
-- o banco deixa de entregar os dados dele, as aulas, os avisos e as questões.
-- Quem suspende: o CEO (qualquer aluno) e o mentor (só os próprios alunos).
-- Pode rodar de novo sem problema. Rode depois de videoaulas.sql.
-- =====================================================================

alter table public.perfis add column if not exists suspenso boolean not null default false;
alter table public.perfis add column if not exists suspenso_em timestamptz;

-- true para todo mundo, menos aluno suspenso
create or replace function public.acesso_liberado()
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.perfis where id = auth.uid() and papel = 'aluno' and suspenso);
$$;

-- O aluno suspenso deixa de ver os próprios dados (horário, simulados, erros, redações...)
create or replace function public.pode_ver_aluno(p_aluno uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (p_aluno = auth.uid() and public.acesso_liberado()) or public.eh_ceo() or public.e_meu_aluno(p_aluno);
$$;

create or replace function public.pasta_de_aluno_visivel(p text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if p is null then return false; end if;
  if (p = auth.uid()::text and public.acesso_liberado()) or public.eh_ceo() then return true; end if;
  if p ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return public.e_meu_aluno(p::uuid);
  end if;
  return false;
end;
$$;

-- O mentor pode suspender e reativar os próprios alunos; o aluno não mexe nisso
create or replace function public.proteger_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.eh_ceo() then
    if new.suspenso is distinct from old.suspenso then
      new.suspenso_em := case when new.suspenso then now() else null end;
    end if;
    return new;
  end if;
  if new.id = auth.uid() then
    if (to_jsonb(new) - 'nome' - 'foto_url' - 'mostrar_contagem')
       is distinct from (to_jsonb(old) - 'nome' - 'foto_url' - 'mostrar_contagem') then
      raise exception 'Você só pode alterar seu nome, sua foto e a contagem do ENEM.';
    end if;
  elsif old.mentor_id = auth.uid() then
    if (to_jsonb(new) - 'nome' - 'limite_mensal' - 'suspenso' - 'suspenso_em')
       is distinct from (to_jsonb(old) - 'nome' - 'limite_mensal' - 'suspenso' - 'suspenso_em') then
      raise exception 'Você só pode alterar o nome, o limite de aulas e a suspensão dos seus alunos.';
    end if;
    if new.suspenso is distinct from old.suspenso then
      new.suspenso_em := case when new.suspenso then now() else null end;
    else
      new.suspenso_em := old.suspenso_em;
    end if;
  else
    raise exception 'Sem permissão para alterar este perfil.';
  end if;
  new.nome := left(trim(new.nome), 80);
  return new;
end;
$$;

-- Conteúdo para todos os alunos: o suspenso deixa de ver
drop policy if exists "avisos: ver" on public.avisos;
create policy "avisos: ver" on public.avisos
  for select using (
    auth.uid() is not null and public.acesso_liberado() and (
      public.eh_ceo()
      or autor_id is null
      or autor_id = auth.uid()
      or public.papel_de(autor_id) = 'ceo'
      or autor_id = public.meu_mentor_id()
    )
  );

drop policy if exists "videoaulas: ver" on public.videoaulas;
create policy "videoaulas: ver" on public.videoaulas
  for select using (
    auth.uid() is not null and public.acesso_liberado() and (
      public.eh_ceo()
      or autor_id = auth.uid()
      or (publicado and (
        autor_id is null
        or public.papel_de(autor_id) = 'ceo'
        or autor_id = public.meu_mentor_id()
      ))
    )
  );

drop policy if exists "questoes: todos leem" on public.questoes;
create policy "questoes: todos leem" on public.questoes
  for select using (auth.uid() is not null and public.acesso_liberado());

drop policy if exists "respostas: responder" on public.respostas;
create policy "respostas: responder" on public.respostas
  for insert with check (aluno_id = auth.uid() and public.acesso_liberado());

drop policy if exists "videoaulas_vistas: aluno marca" on public.videoaulas_vistas;
create policy "videoaulas_vistas: aluno marca" on public.videoaulas_vistas
  for insert with check (aluno_id = auth.uid() and public.acesso_liberado());

drop policy if exists "atendimentos: ver" on public.atendimentos;
create policy "atendimentos: ver" on public.atendimentos
  for select using (
    public.eh_ceo()
    or mentor_id = auth.uid()
    or (public.acesso_liberado() and (
      aluno_id = auth.uid()
      or (aluno_id is null and inicio > now() and mentor_id = public.meu_mentor_id())
    ))
  );

drop policy if exists "comunidade: alunos baixam" on storage.objects;
create policy "comunidade: alunos baixam" on storage.objects
  for select to authenticated
  using (bucket_id = 'comunidade' and public.acesso_liberado());

-- Marcar aula: bloqueado para aluno suspenso
create or replace function public.reservar_atendimento(p_id uuid, p_tema text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_inicio  timestamptz;
  v_dono    uuid;
  v_limite  int;
  v_mentor  uuid;
  v_usados  int;
begin
  if auth.uid() is null then
    raise exception 'Sua sessão expirou. Entre de novo.';
  end if;
  if not public.acesso_liberado() then
    raise exception 'Seu acesso está suspenso. Fale com seu mentor.';
  end if;

  select limite_mensal, mentor_id into v_limite, v_mentor
  from public.perfis where id = auth.uid() for update;
  if not found then
    raise exception 'Cadastro não encontrado. Fale com seu mentor.';
  end if;

  select inicio, mentor_id into v_inicio, v_dono
  from public.atendimentos where id = p_id and aluno_id is null for update;
  if not found then
    raise exception 'Esse horário acabou de ser reservado. Escolha outro.';
  end if;
  if v_dono is distinct from v_mentor then
    raise exception 'Esse horário não é do seu mentor.';
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
  set aluno_id = auth.uid(), tema = left(coalesce(p_tema, ''), 200), reservado_em = now()
  where id = p_id;
end;
$$;
