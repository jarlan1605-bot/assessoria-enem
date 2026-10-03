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
