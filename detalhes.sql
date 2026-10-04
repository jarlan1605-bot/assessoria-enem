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
