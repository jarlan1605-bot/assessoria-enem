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
