-- =====================================================================
-- Mentoria ENEM — EQUIPE: CEO, MENTORES E ALUNOS POR MENTOR (atualização)
-- Antes, rode (se ainda não rodou): agenda.sql, perfil.sql e comunidade.sql.
-- Depois rode ESTE arquivo UMA vez: SQL Editor > New query > Run.
--
-- O que ele faz:
--  * cria o papel "ceo" (você): mentor + vê e administra tudo;
--  * cada aluno passa a ter um mentor responsável;
--  * mentores contratados só veem os próprios alunos, horários, simulados e agenda;
--  * você (o primeiro mentor cadastrado) vira CEO e seus alunos atuais ficam com você.
-- Nada é apagado.
-- =====================================================================

-- ---------- 1) Papéis e mentor de cada aluno ----------
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check check (papel in ('ceo', 'mentor', 'aluno'));
alter table public.perfis add column if not exists mentor_id uuid references public.perfis (id) on delete set null;
create index if not exists perfis_mentor_idx on public.perfis (mentor_id);

-- ---------- 2) Funções de apoio para as regras ----------
create or replace function public.eh_ceo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and papel = 'ceo');
$$;

-- "mentor" agora inclui o CEO
create or replace function public.eh_mentor()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and papel in ('mentor', 'ceo'));
$$;

create or replace function public.meu_mentor_id()
returns uuid language sql stable security definer set search_path = public as $$
  select mentor_id from public.perfis where id = auth.uid();
$$;

create or replace function public.e_meu_aluno(p_aluno uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = p_aluno and mentor_id = auth.uid());
$$;

-- pode ver: o próprio aluno, o mentor dele ou o CEO
create or replace function public.pode_ver_aluno(p_aluno uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_aluno = auth.uid() or public.eh_ceo() or public.e_meu_aluno(p_aluno);
$$;

-- pode administrar (horário, limite): o mentor dele ou o CEO
create or replace function public.pode_gerir_aluno(p_aluno uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_ceo() or public.e_meu_aluno(p_aluno);
$$;

create or replace function public.papel_de(p_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select papel from public.perfis where id = p_id;
$$;

-- Nome e foto da equipe (mentores e CEO) para todos os logados
create or replace function public.equipe_publica()
returns table (id uuid, nome text, foto_url text, papel text)
language sql stable security definer set search_path = public as $$
  select id, nome, foto_url, papel from public.perfis where papel in ('mentor', 'ceo') order by criado_em;
$$;
revoke execute on function public.equipe_publica() from public, anon;
grant execute on function public.equipe_publica() to authenticated;

-- Foto da tela de login: a do CEO (ou do primeiro mentor)
create or replace function public.foto_do_mentor()
returns text language sql stable security definer set search_path = public as $$
  select foto_url from public.perfis
  where papel in ('ceo', 'mentor') and foto_url is not null
  order by (papel = 'ceo') desc, criado_em
  limit 1;
$$;
grant execute on function public.foto_do_mentor() to anon, authenticated;

-- ---------- 3) Quem vê e edita perfis ----------
drop policy if exists "perfis: ver" on public.perfis;
create policy "perfis: ver" on public.perfis
  for select using (
    id = auth.uid()
    or public.eh_ceo()
    or mentor_id = auth.uid()          -- mentor vê os próprios alunos
    or id = public.meu_mentor_id()     -- aluno vê o próprio mentor
  );

drop policy if exists "perfis: mentor edita" on public.perfis;
create policy "perfis: mentor edita" on public.perfis
  for update using (public.eh_ceo() or mentor_id = auth.uid())
  with check (public.eh_ceo() or mentor_id = auth.uid());

-- Trava de campos:
--   CEO (ou comandos aqui no SQL Editor): pode tudo
--   no próprio perfil: só nome e foto
--   mentor no perfil do próprio aluno: só nome e limite de aulas
create or replace function public.proteger_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.eh_ceo() then
    return new;
  end if;
  if new.id = auth.uid() then
    if (to_jsonb(new) - 'nome' - 'foto_url') is distinct from (to_jsonb(old) - 'nome' - 'foto_url') then
      raise exception 'Você só pode alterar seu nome e sua foto.';
    end if;
  elsif old.mentor_id = auth.uid() then
    if (to_jsonb(new) - 'nome' - 'limite_mensal') is distinct from (to_jsonb(old) - 'nome' - 'limite_mensal') then
      raise exception 'Você só pode alterar o nome e o limite de aulas dos seus alunos.';
    end if;
  else
    raise exception 'Sem permissão para alterar este perfil.';
  end if;
  new.nome := left(trim(new.nome), 80);
  return new;
end;
$$;

-- ---------- 4) Horários de estudo ----------
drop policy if exists "horarios: ver" on public.horarios;
create policy "horarios: ver" on public.horarios
  for select using (public.pode_ver_aluno(aluno_id));

drop policy if exists "horarios: mentor cria" on public.horarios;
create policy "horarios: mentor cria" on public.horarios
  for insert with check (public.pode_gerir_aluno(aluno_id));

drop policy if exists "horarios: mentor edita" on public.horarios;
create policy "horarios: mentor edita" on public.horarios
  for update using (public.pode_gerir_aluno(aluno_id)) with check (public.pode_gerir_aluno(aluno_id));

drop policy if exists "horarios: mentor apaga" on public.horarios;
create policy "horarios: mentor apaga" on public.horarios
  for delete using (public.pode_gerir_aluno(aluno_id));

-- ---------- 5) Simulados ----------
drop policy if exists "simulados: ver" on public.simulados;
create policy "simulados: ver" on public.simulados
  for select using (public.pode_ver_aluno(aluno_id));

drop policy if exists "simulados: criar" on public.simulados;
create policy "simulados: criar" on public.simulados
  for insert with check (public.pode_ver_aluno(aluno_id));

drop policy if exists "simulados: editar" on public.simulados;
create policy "simulados: editar" on public.simulados
  for update using (public.pode_ver_aluno(aluno_id)) with check (public.pode_ver_aluno(aluno_id));

drop policy if exists "simulados: apagar" on public.simulados;
create policy "simulados: apagar" on public.simulados
  for delete using (public.pode_ver_aluno(aluno_id));

-- ---------- 6) Agenda: cada horário tem um mentor dono ----------
alter table public.atendimentos
  add column if not exists mentor_id uuid references public.perfis (id) on delete cascade default auth.uid();
create index if not exists atendimentos_mentor_idx on public.atendimentos (mentor_id);

drop policy if exists "atendimentos: ver" on public.atendimentos;
create policy "atendimentos: ver" on public.atendimentos
  for select using (
    public.eh_ceo()
    or mentor_id = auth.uid()
    or aluno_id = auth.uid()
    or (aluno_id is null and inicio > now() and mentor_id = public.meu_mentor_id())
  );

drop policy if exists "atendimentos: mentor cria" on public.atendimentos;
create policy "atendimentos: mentor cria" on public.atendimentos
  for insert with check (public.eh_ceo() or (public.eh_mentor() and mentor_id = auth.uid()));

drop policy if exists "atendimentos: mentor edita" on public.atendimentos;
create policy "atendimentos: mentor edita" on public.atendimentos
  for update using (public.eh_ceo() or mentor_id = auth.uid())
  with check (
    (public.eh_ceo() or mentor_id = auth.uid())
    and (aluno_id is null or public.eh_ceo() or public.e_meu_aluno(aluno_id))
  );

drop policy if exists "atendimentos: mentor apaga" on public.atendimentos;
create policy "atendimentos: mentor apaga" on public.atendimentos
  for delete using (public.eh_ceo() or mentor_id = auth.uid());

-- Reserva: agora confere também se o horário é do mentor do aluno
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

-- ---------- 7) Comunidade: cada publicação tem um autor ----------
--   publicação do CEO: todos os alunos veem
--   publicação de um mentor: só os alunos dele (e o CEO) veem
alter table public.avisos
  add column if not exists autor_id uuid references public.perfis (id) on delete set null default auth.uid();

drop policy if exists "avisos: ver" on public.avisos;
create policy "avisos: ver" on public.avisos
  for select using (
    auth.uid() is not null and (
      public.eh_ceo()
      or autor_id is null
      or autor_id = auth.uid()
      or public.papel_de(autor_id) = 'ceo'
      or autor_id = public.meu_mentor_id()
    )
  );

drop policy if exists "avisos: mentor cria" on public.avisos;
create policy "avisos: mentor cria" on public.avisos
  for insert with check (public.eh_mentor() and autor_id = auth.uid());

drop policy if exists "avisos: mentor edita" on public.avisos;
create policy "avisos: mentor edita" on public.avisos
  for update using (public.eh_ceo() or autor_id = auth.uid())
  with check (public.eh_ceo() or autor_id = auth.uid());

drop policy if exists "avisos: mentor apaga" on public.avisos;
create policy "avisos: mentor apaga" on public.avisos
  for delete using (public.eh_ceo() or autor_id = auth.uid());

-- ---------- 8) Migração dos dados atuais ----------
-- O primeiro mentor cadastrado (você) vira CEO, se ainda não houver um CEO
update public.perfis set papel = 'ceo'
where id = (select id from public.perfis where papel = 'mentor' order by criado_em limit 1)
  and not exists (select 1 from public.perfis where papel = 'ceo');

-- Alunos sem mentor ficam com o CEO; horários da agenda e avisos antigos também
update public.perfis set mentor_id = (select id from public.perfis where papel = 'ceo' order by criado_em limit 1)
where papel = 'aluno' and mentor_id is null;

update public.atendimentos set mentor_id = (select id from public.perfis where papel = 'ceo' order by criado_em limit 1)
where mentor_id is null;

update public.avisos set autor_id = (select id from public.perfis where papel = 'ceo' order by criado_em limit 1)
where autor_id is null;

-- Confira o resultado:
select nome, email, papel from public.perfis where papel in ('ceo', 'mentor') order by criado_em;
