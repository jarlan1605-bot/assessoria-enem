-- =====================================================================
-- Mentoria ENEM — banco de dados
-- Cole este arquivo inteiro no Supabase: SQL Editor > New query > Run
-- =====================================================================

-- 1) PERFIS: um por pessoa que faz login (mentor ou aluno)
create table if not exists public.perfis (
  id         uuid primary key references auth.users (id) on delete cascade,
  nome       text not null default '',
  email      text,
  papel      text not null default 'aluno' check (papel in ('mentor', 'aluno')),
  criado_em  timestamptz not null default now()
);

-- Diz se quem está logado é o mentor (usado nas regras de acesso)
create or replace function public.eh_mentor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid() and papel = 'mentor'
  );
$$;

-- Toda conta criada em Authentication > Users ganha um perfil de aluno
create or replace function public.criar_perfil_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, nome, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

-- 2) HORÁRIOS: blocos do horário semanal de cada aluno
create table if not exists public.horarios (
  id         uuid primary key default gen_random_uuid(),
  aluno_id   uuid not null references public.perfis (id) on delete cascade,
  dia        smallint not null check (dia between 0 and 6), -- 0 = segunda ... 6 = domingo
  inicio     time not null,
  fim        time not null,
  materia    text not null,
  conteudo   text not null default '',
  criado_em  timestamptz not null default now(),
  check (fim > inicio)
);
create index if not exists horarios_aluno_idx on public.horarios (aluno_id);

-- 3) SIMULADOS: acertos por área (0 a 45) e nota da redação (0 a 1000)
create table if not exists public.simulados (
  id           uuid primary key default gen_random_uuid(),
  aluno_id     uuid not null references public.perfis (id) on delete cascade,
  data         date not null default current_date,
  nome         text not null default '',
  linguagens   smallint check (linguagens between 0 and 45),
  humanas      smallint check (humanas between 0 and 45),
  natureza     smallint check (natureza between 0 and 45),
  matematica   smallint check (matematica between 0 and 45),
  redacao      smallint check (redacao between 0 and 1000),
  observacoes  text not null default '',
  criado_em    timestamptz not null default now()
);
create index if not exists simulados_aluno_idx on public.simulados (aluno_id);

-- =====================================================================
-- REGRAS DE ACESSO (Row Level Security)
--   Aluno: vê só o próprio perfil, o próprio horário e os próprios simulados;
--          lança, edita e apaga os próprios simulados; NÃO mexe no horário.
--   Mentor: vê e edita tudo de todos.
-- =====================================================================
alter table public.perfis    enable row level security;
alter table public.horarios  enable row level security;
alter table public.simulados enable row level security;

-- Perfis
drop policy if exists "perfis: ver" on public.perfis;
create policy "perfis: ver" on public.perfis
  for select using (id = auth.uid() or public.eh_mentor());

drop policy if exists "perfis: mentor edita" on public.perfis;
create policy "perfis: mentor edita" on public.perfis
  for update using (public.eh_mentor()) with check (public.eh_mentor());

-- Horários
drop policy if exists "horarios: ver" on public.horarios;
create policy "horarios: ver" on public.horarios
  for select using (aluno_id = auth.uid() or public.eh_mentor());

drop policy if exists "horarios: mentor cria" on public.horarios;
create policy "horarios: mentor cria" on public.horarios
  for insert with check (public.eh_mentor());

drop policy if exists "horarios: mentor edita" on public.horarios;
create policy "horarios: mentor edita" on public.horarios
  for update using (public.eh_mentor()) with check (public.eh_mentor());

drop policy if exists "horarios: mentor apaga" on public.horarios;
create policy "horarios: mentor apaga" on public.horarios
  for delete using (public.eh_mentor());

-- Simulados
drop policy if exists "simulados: ver" on public.simulados;
create policy "simulados: ver" on public.simulados
  for select using (aluno_id = auth.uid() or public.eh_mentor());

drop policy if exists "simulados: criar" on public.simulados;
create policy "simulados: criar" on public.simulados
  for insert with check (aluno_id = auth.uid() or public.eh_mentor());

drop policy if exists "simulados: editar" on public.simulados;
create policy "simulados: editar" on public.simulados
  for update using (aluno_id = auth.uid() or public.eh_mentor())
  with check (aluno_id = auth.uid() or public.eh_mentor());

drop policy if exists "simulados: apagar" on public.simulados;
create policy "simulados: apagar" on public.simulados
  for delete using (aluno_id = auth.uid() or public.eh_mentor());

-- =====================================================================
-- DEPOIS de criar a SUA conta em Authentication > Users, rode a linha
-- abaixo (trocando o e-mail) para virar mentor:
--
--   update public.perfis set papel = 'mentor', nome = 'Seu nome'
--   where email = 'seu-email@exemplo.com';
-- =====================================================================
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
-- =====================================================================
-- Mentoria ENEM — NOME E FOTO DE PERFIL (atualização)
-- Rode este arquivo UMA vez no Supabase: SQL Editor > New query > Run.
-- Ele só ACRESCENTA coisas: não apaga nada do que já existe.
-- =====================================================================

-- 1) Endereço da foto de cada pessoa
alter table public.perfis add column if not exists foto_url text;

-- 2) Cada pessoa pode editar o PRÓPRIO perfil...
drop policy if exists "perfis: editar o próprio" on public.perfis;
create policy "perfis: editar o próprio" on public.perfis
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ...mas o aluno só consegue mudar NOME e FOTO.
-- (papel, e-mail e limite de aulas continuam só com o mentor;
--  comandos rodados por você aqui no SQL Editor não são bloqueados)
create or replace function public.proteger_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.eh_mentor() then
    return new;
  end if;
  if (to_jsonb(new) - 'nome' - 'foto_url') is distinct from (to_jsonb(old) - 'nome' - 'foto_url') then
    raise exception 'Você só pode alterar seu nome e sua foto.';
  end if;
  new.nome := left(trim(new.nome), 80);
  return new;
end;
$$;

drop trigger if exists proteger_perfil on public.perfis;
create trigger proteger_perfil
  before update on public.perfis
  for each row execute function public.proteger_perfil();

-- 3) Foto do mentor visível para todos (aparece no topo do site e na tela de login)
create or replace function public.foto_do_mentor()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select foto_url from public.perfis
  where papel = 'mentor' and foto_url is not null
  order by criado_em
  limit 1;
$$;
grant execute on function public.foto_do_mentor() to anon, authenticated;

-- 4) Pasta de fotos (Supabase Storage): imagens de até 2 MB, leitura pública.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Cada pessoa só mexe na própria subpasta (avatars/<id-da-pessoa>/...)
drop policy if exists "avatars: ver a própria pasta" on storage.objects;
create policy "avatars: ver a própria pasta" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: enviar na própria pasta" on storage.objects;
create policy "avatars: enviar na própria pasta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: alterar na própria pasta" on storage.objects;
create policy "avatars: alterar na própria pasta" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: apagar da própria pasta" on storage.objects;
create policy "avatars: apagar da própria pasta" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
-- =====================================================================
-- Mentoria ENEM — COMUNIDADE (avisos, simulados e materiais)
-- Rode este arquivo UMA vez no Supabase: SQL Editor > New query > Run.
-- Ele só ACRESCENTA coisas: não apaga nada do que já existe.
-- =====================================================================

create table if not exists public.avisos (
  id         uuid primary key default gen_random_uuid(),
  titulo     text not null check (char_length(titulo) between 1 and 160),
  texto      text not null default '',
  tipo       text not null default 'aviso' check (tipo in ('aviso', 'simulado', 'material', 'evento')),
  link       text not null default '',
  fixado     boolean not null default false,
  anexos     jsonb not null default '[]'::jsonb,  -- [{nome, caminho, tamanho, tipo}]
  criado_em  timestamptz not null default now(),
  editado_em timestamptz
);
create index if not exists avisos_criado_idx on public.avisos (fixado desc, criado_em desc);

alter table public.avisos enable row level security;

-- Todo mundo que está logado lê; só o mentor publica, edita e apaga.
drop policy if exists "avisos: ver" on public.avisos;
create policy "avisos: ver" on public.avisos
  for select using (auth.uid() is not null);

drop policy if exists "avisos: mentor cria" on public.avisos;
create policy "avisos: mentor cria" on public.avisos
  for insert with check (public.eh_mentor());

drop policy if exists "avisos: mentor edita" on public.avisos;
create policy "avisos: mentor edita" on public.avisos
  for update using (public.eh_mentor()) with check (public.eh_mentor());

drop policy if exists "avisos: mentor apaga" on public.avisos;
create policy "avisos: mentor apaga" on public.avisos
  for delete using (public.eh_mentor());

-- Pasta de anexos (PRIVADA: só quem está logado no site consegue baixar).
-- Limite de 25 MB por arquivo.
insert into storage.buckets (id, name, public, file_size_limit)
values ('comunidade', 'comunidade', false, 26214400)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;

drop policy if exists "comunidade: alunos baixam" on storage.objects;
create policy "comunidade: alunos baixam" on storage.objects
  for select to authenticated
  using (bucket_id = 'comunidade');

drop policy if exists "comunidade: mentor envia" on storage.objects;
create policy "comunidade: mentor envia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'comunidade' and public.eh_mentor());

drop policy if exists "comunidade: mentor altera" on storage.objects;
create policy "comunidade: mentor altera" on storage.objects
  for update to authenticated
  using (bucket_id = 'comunidade' and public.eh_mentor())
  with check (bucket_id = 'comunidade' and public.eh_mentor());

drop policy if exists "comunidade: mentor apaga" on storage.objects;
create policy "comunidade: mentor apaga" on storage.objects
  for delete to authenticated
  using (bucket_id = 'comunidade' and public.eh_mentor());
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
-- =====================================================================
-- Mentoria ENEM — RECURSOS NOVOS (caderno de erros, check-in, metas, SISU,
-- redação, relatório, financeiro, página de vendas e contagem do ENEM)
-- Antes, rode (se ainda não rodou): agenda.sql, perfil.sql, comunidade.sql e equipe.sql.
-- Depois rode ESTE arquivo UMA vez: SQL Editor > New query > Run.
-- Ele só ACRESCENTA coisas: não apaga nada do que já existe.
-- =====================================================================

-- ---------- 0) Preferência de cada pessoa: mostrar ou esconder a contagem do ENEM ----------
alter table public.perfis add column if not exists mostrar_contagem boolean not null default true;

-- A pessoa pode mudar no próprio perfil: nome, foto e a contagem
create or replace function public.proteger_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.eh_ceo() then
    return new;
  end if;
  if new.id = auth.uid() then
    if (to_jsonb(new) - 'nome' - 'foto_url' - 'mostrar_contagem')
       is distinct from (to_jsonb(old) - 'nome' - 'foto_url' - 'mostrar_contagem') then
      raise exception 'Você só pode alterar seu nome, sua foto e a contagem do ENEM.';
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

-- ---------- 1) CADERNO DE ERROS ----------
create table if not exists public.erros (
  id               uuid primary key default gen_random_uuid(),
  aluno_id         uuid not null references public.perfis (id) on delete cascade,
  area             text not null check (area in ('linguagens', 'humanas', 'natureza', 'matematica')),
  materia          text not null default '',
  assunto          text not null default '',
  motivo           text not null default 'conteudo' check (motivo in ('conteudo', 'atencao', 'tempo', 'interpretacao', 'chute')),
  origem           text not null default '',
  anotacao         text not null default '',
  revisoes         smallint not null default 0,
  proxima_revisao  date default (current_date + 1),
  dominado         boolean not null default false,
  criado_em        timestamptz not null default now()
);
create index if not exists erros_aluno_idx on public.erros (aluno_id, proxima_revisao);
alter table public.erros enable row level security;
drop policy if exists "erros: tudo" on public.erros;
create policy "erros: tudo" on public.erros
  for all using (public.pode_ver_aluno(aluno_id)) with check (public.pode_ver_aluno(aluno_id));

-- ---------- 2) CHECK-IN DIÁRIO DO HORÁRIO ----------
create table if not exists public.checkins (
  id          uuid primary key default gen_random_uuid(),
  aluno_id    uuid not null references public.perfis (id) on delete cascade,
  horario_id  uuid not null references public.horarios (id) on delete cascade,
  dia         date not null,
  status      text not null check (status in ('feito', 'parcial', 'nao')),
  criado_em   timestamptz not null default now(),
  unique (horario_id, dia)
);
create index if not exists checkins_aluno_idx on public.checkins (aluno_id, dia);
alter table public.checkins enable row level security;
drop policy if exists "checkins: tudo" on public.checkins;
create policy "checkins: tudo" on public.checkins
  for all using (public.pode_ver_aluno(aluno_id))
  with check (
    public.pode_ver_aluno(aluno_id)
    and exists (select 1 from public.horarios h where h.id = horario_id and h.aluno_id = checkins.aluno_id)
  );

-- ---------- 3) METAS ----------
create table if not exists public.metas (
  id         uuid primary key default gen_random_uuid(),
  aluno_id   uuid not null references public.perfis (id) on delete cascade,
  area       text not null check (area in ('linguagens', 'humanas', 'natureza', 'matematica', 'redacao', 'total')),
  alvo       numeric(6,1) not null,
  prazo      date,
  criado_em  timestamptz not null default now()
);
alter table public.metas enable row level security;
drop policy if exists "metas: tudo" on public.metas;
create policy "metas: tudo" on public.metas
  for all using (public.pode_ver_aluno(aluno_id)) with check (public.pode_ver_aluno(aluno_id));

-- ---------- 4) CALCULADORA SISU (cenários salvos) ----------
create table if not exists public.sisu_cenarios (
  id          uuid primary key default gen_random_uuid(),
  aluno_id    uuid not null references public.perfis (id) on delete cascade,
  curso       text not null default '',
  instituicao text not null default '',
  peso_lc     numeric(4,2) not null default 1,
  peso_ch     numeric(4,2) not null default 1,
  peso_cn     numeric(4,2) not null default 1,
  peso_mt     numeric(4,2) not null default 1,
  peso_red    numeric(4,2) not null default 1,
  nota_corte  numeric(6,2),
  nota_lc     numeric(6,1),
  nota_ch     numeric(6,1),
  nota_cn     numeric(6,1),
  nota_mt     numeric(6,1),
  nota_red    numeric(6,1),
  criado_em   timestamptz not null default now()
);
alter table public.sisu_cenarios enable row level security;
drop policy if exists "sisu: tudo" on public.sisu_cenarios;
create policy "sisu: tudo" on public.sisu_cenarios
  for all using (public.pode_ver_aluno(aluno_id)) with check (public.pode_ver_aluno(aluno_id));

-- ---------- 5) REDAÇÕES (envio pelo aluno, correção pelo mentor) ----------
create table if not exists public.redacoes (
  id            uuid primary key default gen_random_uuid(),
  aluno_id      uuid not null references public.perfis (id) on delete cascade,
  tema          text not null default '',
  arquivos      jsonb not null default '[]'::jsonb,  -- [{nome, caminho, tipo}]
  status        text not null default 'enviada' check (status in ('enviada', 'corrigida')),
  c1 smallint check (c1 between 0 and 200),
  c2 smallint check (c2 between 0 and 200),
  c3 smallint check (c3 between 0 and 200),
  c4 smallint check (c4 between 0 and 200),
  c5 smallint check (c5 between 0 and 200),
  comentario    text not null default '',
  corretor_id   uuid references public.perfis (id) on delete set null,
  enviada_em    timestamptz not null default now(),
  corrigida_em  timestamptz
);
create index if not exists redacoes_aluno_idx on public.redacoes (aluno_id, enviada_em desc);
alter table public.redacoes enable row level security;

drop policy if exists "redacoes: ver" on public.redacoes;
create policy "redacoes: ver" on public.redacoes for select using (public.pode_ver_aluno(aluno_id));
drop policy if exists "redacoes: enviar" on public.redacoes;
create policy "redacoes: enviar" on public.redacoes for insert with check (public.pode_ver_aluno(aluno_id));
drop policy if exists "redacoes: editar" on public.redacoes;
create policy "redacoes: editar" on public.redacoes for update
  using (public.pode_ver_aluno(aluno_id)) with check (public.pode_ver_aluno(aluno_id));
drop policy if exists "redacoes: apagar" on public.redacoes;
create policy "redacoes: apagar" on public.redacoes for delete
  using (public.pode_gerir_aluno(aluno_id) or (aluno_id = auth.uid() and status = 'enviada'));

-- O aluno não dá nota para si mesmo: notas, comentário e status são só do mentor/CEO
create or replace function public.proteger_redacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.pode_gerir_aluno(new.aluno_id) then
    if new.status = 'corrigida' and (tg_op = 'INSERT' or old.status <> 'corrigida') then
      new.corrigida_em := now();
      new.corretor_id := auth.uid();
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'enviada';
    new.c1 := null; new.c2 := null; new.c3 := null; new.c4 := null; new.c5 := null;
    new.comentario := ''; new.corretor_id := null; new.corrigida_em := null;
    return new;
  end if;
  if old.status <> 'enviada'
     or (to_jsonb(new) - 'tema' - 'arquivos') is distinct from (to_jsonb(old) - 'tema' - 'arquivos') then
    raise exception 'Depois de corrigida, a redação não pode ser alterada pelo aluno.';
  end if;
  return new;
end;
$$;
drop trigger if exists proteger_redacao on public.redacoes;
create trigger proteger_redacao before insert or update on public.redacoes
  for each row execute function public.proteger_redacao();

-- Pasta privada das redações: redacoes/<id-do-aluno>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('redacoes', 'redacoes', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.pasta_de_aluno_visivel(p text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if p is null then return false; end if;
  if p = auth.uid()::text or public.eh_ceo() then return true; end if;
  if p ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return public.e_meu_aluno(p::uuid);
  end if;
  return false;
end;
$$;

drop policy if exists "redacoes: ver arquivos" on storage.objects;
create policy "redacoes: ver arquivos" on storage.objects for select to authenticated
  using (bucket_id = 'redacoes' and public.pasta_de_aluno_visivel((storage.foldername(name))[1]));
drop policy if exists "redacoes: enviar arquivos" on storage.objects;
create policy "redacoes: enviar arquivos" on storage.objects for insert to authenticated
  with check (bucket_id = 'redacoes' and public.pasta_de_aluno_visivel((storage.foldername(name))[1]));
drop policy if exists "redacoes: apagar arquivos" on storage.objects;
create policy "redacoes: apagar arquivos" on storage.objects for delete to authenticated
  using (bucket_id = 'redacoes' and public.pasta_de_aluno_visivel((storage.foldername(name))[1]));

-- ---------- 6) RELATÓRIO MENSAL: comentário do mentor ----------
create table if not exists public.relatorios (
  aluno_id       uuid not null references public.perfis (id) on delete cascade,
  mes            date not null,             -- sempre o dia 1 do mês
  comentario     text not null default '',
  autor_id       uuid references public.perfis (id) on delete set null default auth.uid(),
  atualizado_em  timestamptz not null default now(),
  primary key (aluno_id, mes)
);
alter table public.relatorios enable row level security;
drop policy if exists "relatorios: ver" on public.relatorios;
create policy "relatorios: ver" on public.relatorios for select using (public.pode_ver_aluno(aluno_id));
drop policy if exists "relatorios: escrever" on public.relatorios;
create policy "relatorios: escrever" on public.relatorios for insert with check (public.pode_gerir_aluno(aluno_id));
drop policy if exists "relatorios: editar" on public.relatorios;
create policy "relatorios: editar" on public.relatorios for update
  using (public.pode_gerir_aluno(aluno_id)) with check (public.pode_gerir_aluno(aluno_id));

-- ---------- 7) FINANCEIRO (só o CEO vê) ----------
create table if not exists public.contratos (
  aluno_id        uuid primary key references public.perfis (id) on delete cascade,
  valor_mensal    numeric(10,2) not null default 0,
  dia_vencimento  smallint not null default 10 check (dia_vencimento between 1 and 28),
  responsavel     text not null default '',
  telefone        text not null default '',
  observacoes     text not null default ''
);
create table if not exists public.repasses (
  mentor_id  uuid primary key references public.perfis (id) on delete cascade,
  percentual numeric(5,2) not null default 0 check (percentual between 0 and 100)
);
create table if not exists public.mensalidades (
  id           uuid primary key default gen_random_uuid(),
  aluno_id     uuid not null references public.perfis (id) on delete cascade,
  competencia  date not null,               -- dia 1 do mês de referência
  valor        numeric(10,2) not null,
  vencimento   date not null,
  pago_em      date,
  forma        text not null default '',
  observacoes  text not null default '',
  unique (aluno_id, competencia)
);
alter table public.contratos enable row level security;
alter table public.repasses enable row level security;
alter table public.mensalidades enable row level security;
drop policy if exists "contratos: ceo" on public.contratos;
create policy "contratos: ceo" on public.contratos for all using (public.eh_ceo()) with check (public.eh_ceo());
drop policy if exists "repasses: ceo" on public.repasses;
create policy "repasses: ceo" on public.repasses for all using (public.eh_ceo()) with check (public.eh_ceo());
drop policy if exists "mensalidades: ceo" on public.mensalidades;
create policy "mensalidades: ceo" on public.mensalidades for all using (public.eh_ceo()) with check (public.eh_ceo());

-- ---------- 8) PÁGINA DE VENDAS E DATA DO ENEM ----------
create table if not exists public.site_config (
  id          smallint primary key default 1 check (id = 1),
  data_enem_1 timestamptz,
  data_enem_2 timestamptz,
  titulo      text not null default '',
  subtitulo   text not null default '',
  whatsapp    text not null default '',
  instagram   text not null default '',
  planos      jsonb not null default '[]'::jsonb,     -- [{nome, preco, destaque, itens:[...]}]
  numeros     jsonb not null default '[]'::jsonb,     -- [{valor, rotulo}]
  atualizado_em timestamptz not null default now()
);
insert into public.site_config (id, data_enem_1, data_enem_2, titulo, subtitulo, instagram, planos)
values (
  1,
  '2026-11-08 13:30:00-03',
  '2026-11-15 13:30:00-03',
  'Sua aprovação com um plano feito para você',
  'Mentoria para o ENEM com horário de estudos personalizado, simulados acompanhados de perto e aulas individuais.',
  'jarlanamed',
  '[{"nome":"Mentoria até o ENEM","preco":"","destaque":true,"itens":["Horário de estudos personalizado","Simulados semanais com correção","Suporte diário pelo WhatsApp","Aulas individuais com o mentor","Caderno de erros e evolução no site"]}]'::jsonb
)
on conflict (id) do nothing;

alter table public.site_config enable row level security;
drop policy if exists "site: todos leem" on public.site_config;
create policy "site: todos leem" on public.site_config for select using (true);
drop policy if exists "site: ceo edita" on public.site_config;
create policy "site: ceo edita" on public.site_config for update using (public.eh_ceo()) with check (public.eh_ceo());
grant select on public.site_config to anon;

create table if not exists public.depoimentos (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  resultado  text not null default '',   -- ex.: "Aprovada em Medicina — UFRN"
  texto      text not null,
  foto_url   text,
  publicado  boolean not null default false,
  ordem      smallint not null default 0,
  criado_em  timestamptz not null default now()
);
alter table public.depoimentos enable row level security;
drop policy if exists "depoimentos: ver publicados" on public.depoimentos;
create policy "depoimentos: ver publicados" on public.depoimentos for select using (publicado or public.eh_ceo());
drop policy if exists "depoimentos: ceo edita" on public.depoimentos;
create policy "depoimentos: ceo edita" on public.depoimentos for all using (public.eh_ceo()) with check (public.eh_ceo());
grant select on public.depoimentos to anon;

-- Pasta pública de imagens do site (fotos dos depoimentos); só o CEO envia
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site', 'site', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true;
drop policy if exists "site: ceo envia" on storage.objects;
create policy "site: ceo envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'site' and public.eh_ceo());
drop policy if exists "site: ceo apaga" on storage.objects;
create policy "site: ceo apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'site' and public.eh_ceo());
drop policy if exists "site: ceo lista" on storage.objects;
create policy "site: ceo lista" on storage.objects for select to authenticated
  using (bucket_id = 'site' and public.eh_ceo());
-- =====================================================================
-- Mentoria ENEM — ERROS DETALHADOS NOS SIMULADOS + MATÉRIAS PERSONALIZADAS
-- Antes, rode (se ainda não rodou): agenda, perfil, comunidade, equipe e extras.
-- Depois rode ESTE arquivo UMA vez: SQL Editor > New query > Run.
-- Não apaga nada.
-- =====================================================================

-- 1) Simulados: detalhes de cada área (questões válidas, tipos de erro, erros por matéria)
--    Formato: { "natureza": { "questoes": 45, "descuido": 2, "conteudo": 3, "lacuna": 4,
--                              "materias": { "Física": 4, "Química": 3, "Biologia": 2 } }, ... }
alter table public.simulados add column if not exists detalhes jsonb not null default '{}'::jsonb;

-- 2) Caderno de erros: ligado ao simulado e com os 3 tipos da planilha
alter table public.erros add column if not exists simulado_id uuid references public.simulados (id) on delete set null;
alter table public.erros add column if not exists numero_questao smallint;
create index if not exists erros_simulado_idx on public.erros (simulado_id);

alter table public.erros drop constraint if exists erros_motivo_check;
-- tipos antigos viram os novos: atenção/tempo/interpretação → descuido; chute → lacuna
update public.erros set motivo = 'descuido' where motivo in ('atencao', 'tempo', 'interpretacao');
update public.erros set motivo = 'lacuna' where motivo = 'chute';
alter table public.erros alter column motivo set default 'conteudo';
alter table public.erros add constraint erros_motivo_check check (motivo in ('descuido', 'conteudo', 'lacuna'));

-- 3) Matérias e tópicos personalizados do horário (FACEX, Anki, Caminhada...)
create table if not exists public.materias_personalizadas (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null unique check (char_length(nome) between 1 and 40),
  cor           text not null default '#868e96' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  conta_estudo  boolean not null default true,
  criado_em     timestamptz not null default now()
);
alter table public.materias_personalizadas enable row level security;
drop policy if exists "materias: todos leem" on public.materias_personalizadas;
create policy "materias: todos leem" on public.materias_personalizadas for select using (auth.uid() is not null);
drop policy if exists "materias: equipe edita" on public.materias_personalizadas;
create policy "materias: equipe edita" on public.materias_personalizadas for all
  using (public.eh_mentor()) with check (public.eh_mentor());

-- 4) Cada bloco do horário diz se conta como hora de estudo
alter table public.horarios add column if not exists conta_estudo boolean not null default true;
update public.horarios set conta_estudo = false where materia = 'Descanso';


-- =====================================================================
-- Mentoria ENEM — BANCO DE QUESTÕES
-- Antes, rode (se ainda não rodou): agenda, perfil, comunidade, equipe, extras e detalhes.
-- Depois rode ESTE arquivo UMA vez: SQL Editor > New query > Run.
-- Não apaga nada.
-- =====================================================================

create table if not exists public.questoes (
  id            uuid primary key default gen_random_uuid(),
  banca         text not null default 'ENEM/Inep',
  prova         text not null default '',          -- ex.: "ENEM 2023 — 2º dia — Caderno Azul"
  ano           smallint,
  numero        smallint,
  area          text not null check (area in ('linguagens', 'humanas', 'natureza', 'matematica')),
  materia       text not null default '',
  assunto       text not null default '',
  dificuldade   text not null default 'media' check (dificuldade in ('facil', 'media', 'dificil')),
  enunciado     text not null default '',
  imagens       jsonb not null default '[]'::jsonb,  -- ["https://..."] na ordem em que aparecem
  alternativas  jsonb not null default '{}'::jsonb,  -- {"A": "...", "B": "...", ...}
  gabarito      char(1) check (gabarito in ('A', 'B', 'C', 'D', 'E')),  -- vazio = questão anulada
  comentario    text not null default '',
  revisado      boolean not null default false,       -- conferido por um mentor
  fonte_url     text not null default '',
  autor_id      uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists questoes_prova_numero_idx on public.questoes (prova, numero);
create index if not exists questoes_filtros_idx on public.questoes (area, materia, ano);

create or replace function public.carimbar_questao()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;
drop trigger if exists carimbar_questao on public.questoes;
create trigger carimbar_questao before update on public.questoes
  for each row execute function public.carimbar_questao();

alter table public.questoes enable row level security;
drop policy if exists "questoes: todos leem" on public.questoes;
create policy "questoes: todos leem" on public.questoes for select using (auth.uid() is not null);
drop policy if exists "questoes: mentores editam" on public.questoes;
create policy "questoes: mentores editam" on public.questoes for all
  using (public.eh_mentor()) with check (public.eh_mentor());

-- Respostas dos alunos (a correção é feita pelo banco, não dá para "se dar" acerto)
create table if not exists public.respostas (
  id           uuid primary key default gen_random_uuid(),
  aluno_id     uuid not null references public.perfis (id) on delete cascade default auth.uid(),
  questao_id   uuid not null references public.questoes (id) on delete cascade,
  alternativa  char(1) not null check (alternativa in ('A', 'B', 'C', 'D', 'E')),
  correta      boolean not null default false,
  tempo_seg    integer,
  criado_em    timestamptz not null default now()
);
create index if not exists respostas_aluno_idx on public.respostas (aluno_id, questao_id);
create index if not exists respostas_questao_idx on public.respostas (questao_id);

create or replace function public.corrigir_resposta()
returns trigger language plpgsql security definer set search_path = public as $$
declare g char(1);
begin
  select gabarito into g from public.questoes where id = new.questao_id;
  new.correta := (g is not null and new.alternativa = g);
  return new;
end;
$$;
drop trigger if exists corrigir_resposta on public.respostas;
create trigger corrigir_resposta before insert or update on public.respostas
  for each row execute function public.corrigir_resposta();

alter table public.respostas enable row level security;
drop policy if exists "respostas: ver" on public.respostas;
create policy "respostas: ver" on public.respostas for select using (public.pode_ver_aluno(aluno_id));
drop policy if exists "respostas: responder" on public.respostas;
create policy "respostas: responder" on public.respostas for insert with check (aluno_id = auth.uid());
drop policy if exists "respostas: apagar" on public.respostas;
create policy "respostas: apagar" on public.respostas for delete using (aluno_id = auth.uid() or public.pode_gerir_aluno(aluno_id));

-- Caderno de erros: lembrar de qual questão do banco o erro veio
alter table public.erros add column if not exists questao_id uuid references public.questoes (id) on delete set null;

-- Imagens das questões (gráficos, figuras): leitura pública, só a equipe envia
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('questoes', 'questoes', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update set public = true;
drop policy if exists "questoes: equipe envia" on storage.objects;
create policy "questoes: equipe envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'questoes' and public.eh_mentor());
drop policy if exists "questoes: equipe altera" on storage.objects;
create policy "questoes: equipe altera" on storage.objects for update to authenticated
  using (bucket_id = 'questoes' and public.eh_mentor()) with check (bucket_id = 'questoes' and public.eh_mentor());
drop policy if exists "questoes: equipe apaga" on storage.objects;
create policy "questoes: equipe apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'questoes' and public.eh_mentor());
drop policy if exists "questoes: equipe lista" on storage.objects;
create policy "questoes: equipe lista" on storage.objects for select to authenticated
  using (bucket_id = 'questoes' and public.eh_mentor());


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


-- =====================================================================
-- (acrescentado) conteúdo de gamificacao.sql — rodar depois de xp.sql e questoes.sql
-- =====================================================================
-- =====================================================================
-- Assessoria J&C — "ESTUDAR HOJE" (missões, ofensiva, conquistas, foco, listas, pasta)
-- Rodar DEPOIS de schema.sql, xp.sql e questoes.sql.
-- Pode rodar de novo sem erro: só cria o que falta e não apaga dados.
-- O XP continua sendo dado só pelo banco (função _dar_xp do xp.sql).
-- =====================================================================

-- ---------- 1) Perfil: metas do dia, WhatsApp do mentor e nome no ranking de foco ----------
alter table public.perfis add column if not exists meta_questoes_dia smallint not null default 30;
alter table public.perfis add column if not exists meta_foco_min smallint not null default 50;
alter table public.perfis add column if not exists whatsapp text not null default '';
alter table public.perfis add column if not exists ranking_foco text not null default 'primeiro';
do $$ begin
  alter table public.perfis add constraint perfis_meta_questoes_check check (meta_questoes_dia between 1 and 500);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.perfis add constraint perfis_meta_foco_check check (meta_foco_min between 5 and 600);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.perfis add constraint perfis_ranking_foco_check check (ranking_foco in ('primeiro', 'anonimo'));
exception when duplicate_object then null; end $$;

-- Quem pode mudar o quê no perfil (mesma regra de antes + os campos novos):
-- aluno: nome, foto, contagem e como aparece no ranking de foco;
-- mentor (o próprio): também o WhatsApp; mentor do aluno: também as metas do dia.
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
    if public.eh_mentor() then
      if (to_jsonb(new) - 'nome' - 'foto_url' - 'mostrar_contagem' - 'vitrine' - 'nascimento' - 'naturalidade' - 'caracteristicas' - 'legenda' - 'disponivel' - 'aprovacao' - 'questoes_feitas' - 'especialidade' - 'whatsapp' - 'ranking_foco')
         is distinct from (to_jsonb(old) - 'nome' - 'foto_url' - 'mostrar_contagem' - 'vitrine' - 'nascimento' - 'naturalidade' - 'caracteristicas' - 'legenda' - 'disponivel' - 'aprovacao' - 'questoes_feitas' - 'especialidade' - 'whatsapp' - 'ranking_foco') then
        raise exception 'Você só pode alterar seu nome, sua foto, a contagem do ENEM, o WhatsApp e os dados da página de mentores.';
      end if;
    elsif (to_jsonb(new) - 'nome' - 'foto_url' - 'mostrar_contagem' - 'ranking_foco')
       is distinct from (to_jsonb(old) - 'nome' - 'foto_url' - 'mostrar_contagem' - 'ranking_foco') then
      raise exception 'Você só pode alterar seu nome, sua foto, a contagem do ENEM e como aparece no ranking.';
    end if;
  elsif old.mentor_id = auth.uid() then
    if (to_jsonb(new) - 'nome' - 'limite_mensal' - 'suspenso' - 'suspenso_em' - 'meta_questoes_dia' - 'meta_foco_min')
       is distinct from (to_jsonb(old) - 'nome' - 'limite_mensal' - 'suspenso' - 'suspenso_em' - 'meta_questoes_dia' - 'meta_foco_min') then
      raise exception 'Você só pode alterar o nome, o limite de aulas, as metas do dia e a suspensão dos seus alunos.';
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
  new.whatsapp := left(regexp_replace(coalesce(new.whatsapp, ''), '\D', '', 'g'), 13);
  return new;
end;
$$;

-- ---------- 2) Listas de questões ----------
create table if not exists public.listas (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null check (char_length(trim(titulo)) between 1 and 120),
  descricao   text not null default '',
  prazo       date,
  criado_por  uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em   timestamptz not null default now()
);
create index if not exists listas_criado_por_idx on public.listas (criado_por);

create table if not exists public.lista_questoes (
  lista_id    uuid not null references public.listas (id) on delete cascade,
  questao_id  uuid not null references public.questoes (id) on delete cascade,
  ordem       smallint not null default 0,
  primary key (lista_id, questao_id)
);
create index if not exists lista_questoes_questao_idx on public.lista_questoes (questao_id);

create table if not exists public.lista_alunos (
  lista_id      uuid not null references public.listas (id) on delete cascade,
  aluno_id      uuid not null references public.perfis (id) on delete cascade,
  enviada_em    timestamptz not null default now(),
  aberta_em     timestamptz,
  ultima_em     timestamptz,
  concluida_em  timestamptz,
  acertos       smallint,
  total         smallint,
  primary key (lista_id, aluno_id)
);
create index if not exists lista_alunos_aluno_idx on public.lista_alunos (aluno_id, enviada_em desc);

alter table public.listas enable row level security;
alter table public.lista_questoes enable row level security;
alter table public.lista_alunos enable row level security;

drop policy if exists "listas: ver" on public.listas;
create policy "listas: ver" on public.listas for select using (
  public.eh_mentor() or exists (select 1 from public.lista_alunos la where la.lista_id = listas.id and la.aluno_id = (select auth.uid()))
);
drop policy if exists "listas: equipe cria" on public.listas;
create policy "listas: equipe cria" on public.listas for insert with check (public.eh_mentor() and criado_por = (select auth.uid()));
drop policy if exists "listas: equipe edita" on public.listas;
create policy "listas: equipe edita" on public.listas for update using (public.eh_ceo() or criado_por = (select auth.uid())) with check (public.eh_mentor());
drop policy if exists "listas: equipe apaga" on public.listas;
create policy "listas: equipe apaga" on public.listas for delete using (public.eh_ceo() or criado_por = (select auth.uid()));

drop policy if exists "lista_questoes: ver" on public.lista_questoes;
create policy "lista_questoes: ver" on public.lista_questoes for select using (exists (select 1 from public.listas l where l.id = lista_id));
drop policy if exists "lista_questoes: equipe" on public.lista_questoes;
create policy "lista_questoes: equipe" on public.lista_questoes for all
  using (exists (select 1 from public.listas l where l.id = lista_id and (public.eh_ceo() or l.criado_por = (select auth.uid()))))
  with check (exists (select 1 from public.listas l where l.id = lista_id and (public.eh_ceo() or l.criado_por = (select auth.uid()))));

drop policy if exists "lista_alunos: ver" on public.lista_alunos;
create policy "lista_alunos: ver" on public.lista_alunos for select using (public.pode_ver_aluno(aluno_id));
drop policy if exists "lista_alunos: equipe envia" on public.lista_alunos;
create policy "lista_alunos: equipe envia" on public.lista_alunos for insert with check (public.eh_mentor() and public.pode_gerir_aluno(aluno_id));
drop policy if exists "lista_alunos: equipe tira" on public.lista_alunos;
create policy "lista_alunos: equipe tira" on public.lista_alunos for delete using (public.eh_mentor() and public.pode_gerir_aluno(aluno_id));
-- o aluno não edita direto: abrir/concluir é pelas funções abaixo (o resultado é calculado pelo banco)

-- Respostas dadas dentro de uma lista (continuam valendo para o banco de questões, XP e desempenho)
alter table public.respostas add column if not exists lista_id uuid references public.listas (id) on delete set null;
create index if not exists respostas_lista_idx on public.respostas (lista_id, aluno_id) where lista_id is not null;
create index if not exists respostas_aluno_data_idx on public.respostas (aluno_id, criado_em);

-- ---------- 3) Minha pasta (questões salvas pelo aluno) ----------
create table if not exists public.pasta_questoes (
  aluno_id    uuid not null references public.perfis (id) on delete cascade default auth.uid(),
  questao_id  uuid not null references public.questoes (id) on delete cascade,
  criado_em   timestamptz not null default now(),
  primary key (aluno_id, questao_id)
);
create index if not exists pasta_questoes_questao_idx on public.pasta_questoes (questao_id);
alter table public.pasta_questoes enable row level security;
drop policy if exists "pasta: ver" on public.pasta_questoes;
create policy "pasta: ver" on public.pasta_questoes for select using (public.pode_ver_aluno(aluno_id));
drop policy if exists "pasta: aluno salva" on public.pasta_questoes;
create policy "pasta: aluno salva" on public.pasta_questoes for insert with check (aluno_id = (select auth.uid()) and public.acesso_liberado());
drop policy if exists "pasta: aluno tira" on public.pasta_questoes;
create policy "pasta: aluno tira" on public.pasta_questoes for delete using (aluno_id = (select auth.uid()));

-- ---------- 4) Sessões de foco (pomodoro) ----------
create table if not exists public.sessoes_foco (
  id         uuid primary key default gen_random_uuid(),
  aluno_id   uuid not null references public.perfis (id) on delete cascade,
  materia    text not null default '',
  minutos    smallint not null check (minutos between 1 and 60),
  criado_em  timestamptz not null default now()
);
create index if not exists sessoes_foco_aluno_idx on public.sessoes_foco (aluno_id, criado_em desc);
create index if not exists sessoes_foco_data_idx on public.sessoes_foco (criado_em);
alter table public.sessoes_foco enable row level security;
drop policy if exists "foco: ver" on public.sessoes_foco;
create policy "foco: ver" on public.sessoes_foco for select using (public.pode_ver_aluno(aluno_id));
-- gravar só pela função registrar_foco

-- ---------- 5) Missões do dia e conquistas (escritas só pelo banco) ----------
create table if not exists public.missoes_dia (
  aluno_id       uuid not null references public.perfis (id) on delete cascade,
  dia            date not null,
  total          smallint not null default 0,
  feitas         smallint not null default 0,
  completo       boolean not null default false,
  atualizado_em  timestamptz not null default now(),
  primary key (aluno_id, dia)
);
alter table public.missoes_dia enable row level security;
drop policy if exists "missoes: ver" on public.missoes_dia;
create policy "missoes: ver" on public.missoes_dia for select using (public.pode_ver_aluno(aluno_id));

create table if not exists public.conquistas_aluno (
  aluno_id  uuid not null references public.perfis (id) on delete cascade,
  codigo    text not null,
  ganho_em  timestamptz not null default now(),
  primary key (aluno_id, codigo)
);
alter table public.conquistas_aluno enable row level security;
drop policy if exists "conquistas: ver" on public.conquistas_aluno;
create policy "conquistas: ver" on public.conquistas_aluno for select using (public.pode_ver_aluno(aluno_id));

-- ---------- 6) Funções ----------
-- Dia de hoje no horário de Brasília
create or replace function public.hoje_br()
returns date language sql stable set search_path = public as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- Tudo o que o aluno fez num dia: blocos do horário (com check-in), questões, foco, revisões e XP
create or replace function public.resumo_dia(p_aluno uuid, p_dia date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d date := coalesce(p_dia, public.hoje_br()); p public.perfis; r jsonb;
begin
  if p_aluno is null or not public.pode_ver_aluno(p_aluno) then return null; end if;
  select * into p from public.perfis where id = p_aluno;
  select jsonb_build_object(
    'dia', d,
    'meta_questoes', coalesce(p.meta_questoes_dia, 30),
    'meta_foco', coalesce(p.meta_foco_min, 50),
    'blocos', coalesce((
      select jsonb_agg(jsonb_build_object('id', h.id, 'materia', h.materia, 'conteudo', h.conteudo,
               'inicio', to_char(h.inicio, 'HH24:MI'), 'fim', to_char(h.fim, 'HH24:MI'),
               'minutos', greatest(0, extract(epoch from (h.fim - h.inicio)) / 60)::int,
               'status', c.status) order by h.inicio)
      from public.horarios h
      left join public.checkins c on c.horario_id = h.id and c.dia = d
      where h.aluno_id = p_aluno and h.mes = date_trunc('month', d)::date
        and h.dia = extract(isodow from d)::int - 1 and coalesce(h.conta_estudo, true)), '[]'::jsonb),
    'questoes', (select count(*) from public.respostas where aluno_id = p_aluno and (criado_em at time zone 'America/Sao_Paulo')::date = d),
    'acertos', (select count(*) from public.respostas where aluno_id = p_aluno and correta and (criado_em at time zone 'America/Sao_Paulo')::date = d),
    'foco_min', (select coalesce(sum(minutos), 0) from public.sessoes_foco where aluno_id = p_aluno and (criado_em at time zone 'America/Sao_Paulo')::date = d),
    'revisoes', (select count(*) from public.xp_eventos where aluno_id = p_aluno and tipo = 'revisao' and (criado_em at time zone 'America/Sao_Paulo')::date = d),
    'xp', (select coalesce(sum(xp), 0) from public.xp_eventos where aluno_id = p_aluno and (criado_em at time zone 'America/Sao_Paulo')::date = d)
  ) into r;
  return r;
end $$;
revoke execute on function public.resumo_dia(uuid, date) from public, anon;
grant execute on function public.resumo_dia(uuid, date) to authenticated;

-- Confere as missões de hoje do aluno logado; se fez todas, ganha o bônus (+40 XP) uma vez por dia
create or replace function public.fechar_dia()
returns jsonb language plpgsql security definer set search_path = public as $$
declare eu uuid := auth.uid(); d date := public.hoje_br(); r jsonb; total int; feitas int; completo boolean; ja boolean;
begin
  if eu is null or not exists (select 1 from public.perfis where id = eu and papel = 'aluno' and not coalesce(suspenso, false)) then return null; end if;
  r := public.resumo_dia(eu, d);
  total := jsonb_array_length(r -> 'blocos') + 3;
  feitas := (select count(*) from jsonb_array_elements(r -> 'blocos') b where b ->> 'status' = 'feito')
          + (case when (r ->> 'questoes')::int >= (r ->> 'meta_questoes')::int then 1 else 0 end)
          + (case when (r ->> 'foco_min')::int >= (r ->> 'meta_foco')::int then 1 else 0 end)
          + (case when (r ->> 'revisoes')::int >= 5 then 1 else 0 end);
  completo := feitas >= total;
  insert into public.missoes_dia (aluno_id, dia, total, feitas, completo, atualizado_em)
  values (eu, d, total, feitas, completo, now())
  on conflict (aluno_id, dia) do update set total = excluded.total, feitas = excluded.feitas, completo = excluded.completo, atualizado_em = now();
  ja := exists (select 1 from public.xp_eventos where aluno_id = eu and chave = 'missoes:' || d);
  if completo and not ja then
    perform public._dar_xp(eu, 'missoes:' || d, 'missoes', 'Todas as missões do dia 🎉', 40);
  end if;
  return jsonb_build_object('total', total, 'feitas', feitas, 'completo', completo, 'bonus_novo', completo and not ja);
end $$;
revoke execute on function public.fechar_dia() from public, anon;
grant execute on function public.fechar_dia() to authenticated;

-- Dias em que o aluno "estudou": check-in, OU 10+ questões, OU a meta de foco, OU 5 revisões, OU alguma missão
create or replace function public._dias_estudo(p_aluno uuid)
returns table (dia date) language plpgsql stable security definer set search_path = public as $$
begin
  return query
  select c.dia from public.checkins c where c.aluno_id = p_aluno and c.status in ('feito', 'parcial')
  union
  select (r.criado_em at time zone 'America/Sao_Paulo')::date from public.respostas r where r.aluno_id = p_aluno group by 1 having count(*) >= 10
  union
  select (s.criado_em at time zone 'America/Sao_Paulo')::date from public.sessoes_foco s where s.aluno_id = p_aluno
    group by 1 having sum(s.minutos) >= (select coalesce(pf.meta_foco_min, 50) from public.perfis pf where pf.id = p_aluno)
  union
  select (e.criado_em at time zone 'America/Sao_Paulo')::date from public.xp_eventos e where e.aluno_id = p_aluno and e.tipo = 'revisao' group by 1 having count(*) >= 5
  union
  select m.dia from public.missoes_dia m where m.aluno_id = p_aluno and m.feitas >= 1;
end $$;
revoke execute on function public._dias_estudo(uuid) from public, anon, authenticated;

-- Ofensiva: dias seguidos, recorde e a semana atual (segunda a domingo)
create or replace function public.ofensiva(p_aluno uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare hoje date := public.hoje_br(); seg date; dias date[]; atual int := 0; recorde int := 0; hoje_conta boolean; semana jsonb;
begin
  if p_aluno is null or not public.pode_ver_aluno(p_aluno) then return null; end if;
  seg := hoje - (extract(isodow from hoje)::int - 1);
  select coalesce(array_agg(distinct x.dia), '{}') into dias from public._dias_estudo(p_aluno) x where x.dia <= hoje;
  hoje_conta := hoje = any (dias);
  with g as (select u.d, u.d - (row_number() over (order by u.d))::int as grupo from unnest(dias) as u(d)),
       s as (select grupo, count(*)::int n, max(g.d) fim from g group by grupo)
  select coalesce(max(n), 0),
         coalesce(max(n) filter (where fim = hoje or (fim = hoje - 1 and not hoje_conta)), 0)
    into recorde, atual from s;
  select jsonb_agg((seg + i) = any (dias) order by i) into semana from generate_series(0, 6) i;
  return jsonb_build_object('atual', atual, 'recorde', recorde, 'hoje_contou', hoje_conta, 'semana', semana, 'segunda', seg);
end $$;
revoke execute on function public.ofensiva(uuid) from public, anon;
grant execute on function public.ofensiva(uuid) to authenticated;

-- Pomodoro concluído: grava a sessão e dá XP (+2 a cada 5 min). Máximo de 16h de foco por dia.
create or replace function public.registrar_foco(p_materia text, p_minutos integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare eu uuid := auth.uid(); m int := least(greatest(coalesce(p_minutos, 0), 0), 60); novo uuid; ja int;
begin
  if eu is null or m < 1 then return null; end if;
  if not exists (select 1 from public.perfis where id = eu and papel = 'aluno' and not coalesce(suspenso, false)) then return null; end if;
  select coalesce(sum(minutos), 0) into ja from public.sessoes_foco
   where aluno_id = eu and (criado_em at time zone 'America/Sao_Paulo')::date = public.hoje_br();
  if ja + m > 960 then raise exception 'Limite de foco do dia atingido.'; end if;
  insert into public.sessoes_foco (aluno_id, materia, minutos) values (eu, left(trim(coalesce(p_materia, '')), 60), m) returning id into novo;
  perform public._dar_xp(eu, 'foco:' || novo, 'foco', left('Foco: ' || coalesce(nullif(trim(p_materia), ''), 'estudo') || ' · ' || m || ' min', 140), greatest(1, (m / 5) * 2));
  return jsonb_build_object('id', novo, 'minutos', m);
end $$;
revoke execute on function public.registrar_foco(text, integer) from public, anon;
grant execute on function public.registrar_foco(text, integer) to authenticated;

-- Ranking de horas de foco: só o nome escolhido (primeiro nome ou anônimo) e os minutos
create or replace function public.ranking_foco(p_desde timestamptz default null)
returns table (nome text, minutos bigint, eu boolean)
language sql stable security definer set search_path = public as $$
  select case when p.ranking_foco = 'anonimo' then 'Aluno anônimo'
              else split_part(coalesce(nullif(trim(p.nome), ''), 'Aluno'), ' ', 1) end,
         sum(s.minutos)::bigint,
         p.id = auth.uid()
  from public.sessoes_foco s
  join public.perfis p on p.id = s.aluno_id and p.papel = 'aluno' and not coalesce(p.suspenso, false)
  where auth.uid() is not null and (p_desde is null or s.criado_em >= p_desde)
  group by p.id
  order by 2 desc, 1;
$$;
revoke execute on function public.ranking_foco(timestamptz) from public, anon;
grant execute on function public.ranking_foco(timestamptz) to authenticated;

-- Desempenho por matéria (vale a 1ª resposta de cada questão)
create or replace function public.desempenho_materias(p_aluno uuid)
returns table (area text, materia text, total bigint, acertos bigint)
language sql stable security definer set search_path = public as $$
  with primeiras as (
    select distinct on (r.questao_id) r.questao_id, r.correta
    from public.respostas r where r.aluno_id = p_aluno order by r.questao_id, r.criado_em
  )
  select q.area, coalesce(nullif(q.materia, ''), q.area), count(*), count(*) filter (where pr.correta)
  from primeiras pr join public.questoes q on q.id = pr.questao_id and q.gabarito is not null
  where public.pode_ver_aluno(p_aluno)
  group by 1, 2;
$$;
revoke execute on function public.desempenho_materias(uuid) from public, anon;
grant execute on function public.desempenho_materias(uuid) to authenticated;

-- Aluno abriu a lista (para "continuar de onde parou")
create or replace function public.abrir_lista(p_lista uuid)
returns void language sql security definer set search_path = public as $$
  update public.lista_alunos set aberta_em = coalesce(aberta_em, now()), ultima_em = now()
  where lista_id = p_lista and aluno_id = auth.uid();
$$;
revoke execute on function public.abrir_lista(uuid) from public, anon;
grant execute on function public.abrir_lista(uuid) to authenticated;

-- Aluno terminou a lista: o banco conta os acertos (última resposta de cada questão da lista)
create or replace function public.concluir_lista(p_lista uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare eu uuid := auth.uid(); a int; t int; n int;
begin
  if not exists (select 1 from public.lista_alunos where lista_id = p_lista and aluno_id = eu) then return null; end if;
  select count(*) into n from public.lista_questoes where lista_id = p_lista;
  with ult as (
    select distinct on (r.questao_id) r.correta from public.respostas r
    join public.lista_questoes lq on lq.lista_id = p_lista and lq.questao_id = r.questao_id
    where r.aluno_id = eu and r.lista_id = p_lista order by r.questao_id, r.criado_em desc
  ) select count(*) filter (where ult.correta), count(*) into a, t from ult;
  update public.lista_alunos set concluida_em = coalesce(concluida_em, now()), ultima_em = now(), acertos = a, total = n
  where lista_id = p_lista and aluno_id = eu;
  perform public._dar_xp(eu, 'lista:' || p_lista, 'lista', 'Terminou uma lista de questões', case when t >= n and n > 0 then 20 else 0 end);
  return jsonb_build_object('acertos', a, 'respondidas', t, 'total', n);
end $$;
revoke execute on function public.concluir_lista(uuid) from public, anon;
grant execute on function public.concluir_lista(uuid) to authenticated;

-- WhatsApp do mentor do aluno logado (ou o número geral da assessoria)
create or replace function public.contato_mentor()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'nome', split_part(coalesce(m.nome, ''), ' ', 1),
    'whatsapp', coalesce(nullif(m.whatsapp, ''), regexp_replace(coalesce((select sc.whatsapp from public.site_config sc where sc.id = 1), ''), '\D', '', 'g'))
  )
  from public.perfis a left join public.perfis m on m.id = a.mentor_id
  where a.id = auth.uid();
$$;
revoke execute on function public.contato_mentor() from public, anon;
grant execute on function public.contato_mentor() to authenticated;

-- Conquistas: o banco calcula, grava a data da 1ª vez e devolve as novas
create or replace function public.atualizar_conquistas(p_aluno uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s jsonb; xp_total bigint; novas jsonb; ehaluno boolean;
begin
  if p_aluno is null or not public.pode_ver_aluno(p_aluno) then return null; end if;
  ehaluno := exists (select 1 from public.perfis where id = p_aluno and papel = 'aluno');
  select coalesce(sum(xp), 0) into xp_total from public.xp_eventos where aluno_id = p_aluno;
  s := jsonb_build_object(
    'questoes', (select count(distinct questao_id) from public.respostas where aluno_id = p_aluno),
    'acertos', (select count(distinct questao_id) from public.respostas where aluno_id = p_aluno and correta),
    'recorde', coalesce((public.ofensiva(p_aluno) ->> 'recorde')::int, 0),
    'simulados', (select count(*) from public.simulado_resultados where aluno_id = p_aluno)
               + (select count(*) from public.gabarito_respostas where aluno_id = p_aluno),
    'dia_prova', (select count(*) from public.xp_eventos where aluno_id = p_aluno and tipo = 'simulado' and xp >= 100),
    'foco_min', (select coalesce(sum(minutos), 0) from public.sessoes_foco where aluno_id = p_aluno),
    'semana_perfeita', (
      with c as (select md.dia, md.dia - (row_number() over (order by md.dia))::int g from public.missoes_dia md where md.aluno_id = p_aluno and md.completo)
      select case when coalesce(max(x.n), 0) >= 7 then 1 else 0 end from (select count(*) n from c group by c.g) x),
    'lista80', (select count(*) from public.lista_alunos where aluno_id = p_aluno and concluida_em is not null and total >= 5 and acertos >= 0.8 * total),
    'dias_completos', (select count(*) from public.xp_eventos where aluno_id = p_aluno and tipo = 'dia'),
    'revisoes', (select count(*) from public.xp_eventos where aluno_id = p_aluno and tipo = 'revisao'),
    'redacoes', (select count(*) from public.redacoes where aluno_id = p_aluno),
    'nivel', floor((1 + sqrt(1 + 0.08 * xp_total)) / 2)::int
  );
  if ehaluno then
    with cat(codigo, chave, alvo) as (values
      ('q1', 'questoes', 1), ('q100', 'questoes', 100), ('q500', 'questoes', 500), ('q1000', 'questoes', 1000),
      ('acertos100', 'acertos', 100), ('seq7', 'recorde', 7), ('seq30', 'recorde', 30), ('seq100', 'recorde', 100),
      ('sim1', 'simulados', 1), ('diaprova', 'dia_prova', 1), ('foco10h', 'foco_min', 600), ('foco50h', 'foco_min', 3000),
      ('semana', 'semana_perfeita', 1), ('lista80', 'lista80', 1), ('dia1', 'dias_completos', 1), ('revisor', 'revisoes', 10),
      ('redacao1', 'redacoes', 1), ('nivel5', 'nivel', 5)),
    ins as (
      insert into public.conquistas_aluno (aluno_id, codigo)
      select p_aluno, cat.codigo from cat where (s ->> cat.chave)::numeric >= cat.alvo
      on conflict (aluno_id, codigo) do nothing
      returning conquistas_aluno.codigo)
    select coalesce(jsonb_agg(ins.codigo), '[]'::jsonb) into novas from ins;
  else
    novas := '[]'::jsonb;
  end if;
  return jsonb_build_object('stats', s, 'novas', novas,
    'ganhas', coalesce((select jsonb_object_agg(ca.codigo, ca.ganho_em) from public.conquistas_aluno ca where ca.aluno_id = p_aluno), '{}'::jsonb));
end $$;
revoke execute on function public.atualizar_conquistas(uuid) from public, anon;
grant execute on function public.atualizar_conquistas(uuid) to authenticated;
