-- =====================================================================
-- Assessoria J&C — XP E RANKING (gamificação)
-- O XP é dado pelo próprio banco (gatilhos), então não dá para "se dar" pontos.
-- Cada ação tem uma chave única: repetir a mesma coisa não soma de novo.
-- Pode rodar de novo sem problema (e já conta o que os alunos fizeram antes).
-- =====================================================================

create table if not exists public.xp_eventos (
  id            uuid primary key default gen_random_uuid(),
  aluno_id      uuid not null references public.perfis (id) on delete cascade,
  chave         text not null,
  tipo          text not null,
  descricao     text not null default '',
  xp            integer not null,
  xp_anterior   integer not null default 0,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (aluno_id, chave)
);
create index if not exists xp_eventos_aluno_idx on public.xp_eventos (aluno_id, atualizado_em desc);
create index if not exists xp_eventos_data_idx on public.xp_eventos (criado_em);
alter table public.xp_eventos enable row level security;
drop policy if exists "xp: ver" on public.xp_eventos;
create policy "xp: ver" on public.xp_eventos for select using (public.pode_ver_aluno(aluno_id));

-- Dá (ou ajusta) o XP de uma ação. xp = 0 apaga.
create or replace function public._dar_xp(p_aluno uuid, p_chave text, p_tipo text, p_desc text, p_xp integer, p_quando timestamptz default now())
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_aluno is null then return; end if;
  if not exists (select 1 from public.perfis where id = p_aluno and papel = 'aluno') then return; end if;
  if coalesce(p_xp, 0) <= 0 then
    delete from public.xp_eventos where aluno_id = p_aluno and chave = p_chave;
    return;
  end if;
  insert into public.xp_eventos (aluno_id, chave, tipo, descricao, xp, xp_anterior, criado_em, atualizado_em)
  values (p_aluno, p_chave, p_tipo, p_desc, p_xp, 0, p_quando, p_quando)
  on conflict (aluno_id, chave) do update
    set xp_anterior = public.xp_eventos.xp, xp = excluded.xp, descricao = excluded.descricao, atualizado_em = now()
    where public.xp_eventos.xp <> excluded.xp;
end $$;
revoke execute on function public._dar_xp(uuid, text, text, text, integer, timestamptz) from public, anon, authenticated;

-- 1) Banco de questões: só a 1ª resposta de cada questão. Acertou +4, errou +2.
create or replace function public._xp_resposta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.xp_eventos where aluno_id = new.aluno_id and chave = 'questao:' || new.questao_id) then
    perform public._dar_xp(new.aluno_id, 'questao:' || new.questao_id, 'questao',
      case when new.correta then 'Acertou uma questão' else 'Respondeu uma questão' end,
      case when new.correta then 4 else 2 end);
  end if;
  return null;
end $$;
drop trigger if exists xp_resposta on public.respostas;
create trigger xp_resposta after insert on public.respostas for each row execute function public._xp_resposta();

-- 2) Horário: check-in de hoje ou de ontem. Feito +10, parcial +5.
--    Dia completo (todos os blocos do dia feitos) +25. Sete dias seguidos com check-in +50.
create or replace function public._xp_dia(p_aluno uuid, p_dia date)
returns void language plpgsql security definer set search_path = public as $$
declare blocos integer; feitos integer; d date; ok boolean := true;
begin
  select count(*) into blocos from public.horarios h
   where h.aluno_id = p_aluno and h.mes = date_trunc('month', p_dia)::date and h.dia = extract(isodow from p_dia)::int - 1;
  select count(*) into feitos from public.checkins c
    join public.horarios h on h.id = c.horario_id
   where c.aluno_id = p_aluno and c.dia = p_dia and c.status = 'feito'
     and h.mes = date_trunc('month', p_dia)::date and h.dia = extract(isodow from p_dia)::int - 1;
  perform public._dar_xp(p_aluno, 'dia_completo:' || p_dia, 'dia', 'Cumpriu todo o horário do dia', case when blocos > 0 and feitos >= blocos then 25 else 0 end);
  -- sequência de 7 dias com algum check-in feito, terminando neste dia
  for i in 0..6 loop
    d := p_dia - i;
    if not exists (select 1 from public.checkins where aluno_id = p_aluno and dia = d and status in ('feito', 'parcial')) then ok := false; exit; end if;
  end loop;
  perform public._dar_xp(p_aluno, 'sequencia7:' || p_dia, 'sequencia', '7 dias seguidos de check-in 🔥', case when ok then 50 else 0 end);
end $$;
revoke execute on function public._xp_dia(uuid, date) from public, anon, authenticated;

create or replace function public._xp_checkin()
returns trigger language plpgsql security definer set search_path = public as $$
declare hoje date := (now() at time zone 'America/Sao_Paulo')::date; r record;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  if r.dia < hoje - 1 or r.dia > hoje then return null; end if;  -- não vale preencher dias antigos
  if tg_op = 'DELETE' then
    perform public._dar_xp(old.aluno_id, 'checkin:' || old.horario_id || ':' || old.dia, 'checkin', '', 0);
  else
    perform public._dar_xp(new.aluno_id, 'checkin:' || new.horario_id || ':' || new.dia, 'checkin',
      case when new.status = 'feito' then 'Check-in: bloco de estudo feito' else 'Check-in: bloco feito em parte' end,
      case new.status when 'feito' then 10 when 'parcial' then 5 else 0 end);
  end if;
  perform public._xp_dia(r.aluno_id, r.dia);
  return null;
end $$;
drop trigger if exists xp_checkin on public.checkins;
create trigger xp_checkin after insert or update or delete on public.checkins for each row execute function public._xp_checkin();

-- 3) Simulado ENEM: +2 por acerto, +1 por questão errada respondida,
--    +100 por um dia inteiro (80+ questões, 80% respondidas), +40 por uma área inteira, +50 por participar de simulado agendado.
create or replace function public._xp_simulado()
returns trigger language plpgsql security definer set search_path = public as $$
declare t public.simulado_tentativas; resp integer; n integer; bonus integer := 0; descr text;
begin
  select * into t from public.simulado_tentativas where id = new.tentativa_id;
  n := coalesce(array_length(t.questao_ids, 1), 0);
  select count(*) into resp from jsonb_object_keys(coalesce(t.respostas, '{}'::jsonb));
  if n >= 80 and resp >= n * 0.8 then bonus := 100; elsif n >= 40 and resp >= n * 0.8 then bonus := 40; end if;
  if t.agendado_id is not null then bonus := bonus + 50; end if;
  descr := 'Simulado: ' || coalesce(nullif(t.titulo, ''), 'concluído');
  perform public._dar_xp(new.aluno_id, 'simulado:' || new.tentativa_id, 'simulado', left(descr, 140),
    2 * new.acertos + greatest(resp - new.acertos, 0) + bonus);
  return null;
end $$;
drop trigger if exists xp_simulado on public.simulado_resultados;
create trigger xp_simulado after insert on public.simulado_resultados for each row execute function public._xp_simulado();

-- 4) Caderno de erros: cada revisão feita +3
create or replace function public._xp_revisao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.revisoes > coalesce(old.revisoes, 0) then
    perform public._dar_xp(new.aluno_id, 'revisao:' || new.id || ':' || new.revisoes, 'revisao', 'Revisou o caderno de erros', 3);
  end if;
  return null;
end $$;
drop trigger if exists xp_revisao on public.erros;
create trigger xp_revisao after update of revisoes on public.erros for each row execute function public._xp_revisao();

-- 5) Redação enviada +30
create or replace function public._xp_redacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._dar_xp(new.aluno_id, 'redacao:' || new.id, 'redacao', 'Enviou uma redação', 30);
  return null;
end $$;
drop trigger if exists xp_redacao on public.redacoes;
create trigger xp_redacao after insert on public.redacoes for each row execute function public._xp_redacao();

-- 6) Trilha: conteúdo concluído (100%) +15
create or replace function public._xp_trilha()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._dar_xp(new.aluno_id, 'trilha:' || new.conteudo, 'trilha', 'Concluiu um conteúdo da trilha', case when new.progresso >= 100 then 15 else 0 end);
  return null;
end $$;
drop trigger if exists xp_trilha on public.trilha_conteudos;
create trigger xp_trilha after insert or update of progresso on public.trilha_conteudos for each row execute function public._xp_trilha();

-- Ranking (só alunos). p_desde = null: geral.
create or replace function public.ranking_xp(p_desde timestamptz default null)
returns table (aluno_id uuid, nome text, foto_url text, xp bigint, xp_total bigint)
language sql stable security definer set search_path = public as $$
  select p.id,
         split_part(coalesce(nullif(trim(p.nome), ''), 'Aluno'), ' ', 1)
           || coalesce(' ' || left(nullif(split_part(trim(p.nome), ' ', 2), ''), 1) || '.', ''),
         p.foto_url,
         coalesce(sum(e.xp) filter (where p_desde is null or e.criado_em >= p_desde), 0),
         coalesce(sum(e.xp), 0)
  from public.perfis p
  left join public.xp_eventos e on e.aluno_id = p.id
  where p.papel = 'aluno' and auth.uid() is not null and coalesce(p.suspenso, false) = false
  group by p.id
  order by 4 desc, 5 desc, 2;
$$;
revoke execute on function public.ranking_xp(timestamptz) from public, anon;
grant execute on function public.ranking_xp(timestamptz) to authenticated;

-- Conta o que já foi feito antes (uma vez só; as chaves impedem duplicar)
insert into public.xp_eventos (aluno_id, chave, tipo, descricao, xp, criado_em, atualizado_em)
select distinct on (r.aluno_id, r.questao_id) r.aluno_id, 'questao:' || r.questao_id, 'questao',
       case when r.correta then 'Acertou uma questão' else 'Respondeu uma questão' end,
       case when r.correta then 4 else 2 end, r.criado_em, r.criado_em
from public.respostas r join public.perfis p on p.id = r.aluno_id and p.papel = 'aluno'
order by r.aluno_id, r.questao_id, r.criado_em
on conflict (aluno_id, chave) do nothing;

insert into public.xp_eventos (aluno_id, chave, tipo, descricao, xp, criado_em, atualizado_em)
select c.aluno_id, 'checkin:' || c.horario_id || ':' || c.dia, 'checkin',
       case when c.status = 'feito' then 'Check-in: bloco de estudo feito' else 'Check-in: bloco feito em parte' end,
       case when c.status = 'feito' then 10 else 5 end, c.criado_em, c.criado_em
from public.checkins c join public.perfis p on p.id = c.aluno_id and p.papel = 'aluno'
where c.status in ('feito', 'parcial')
on conflict (aluno_id, chave) do nothing;

insert into public.xp_eventos (aluno_id, chave, tipo, descricao, xp, criado_em, atualizado_em)
select r.aluno_id, 'redacao:' || r.id, 'redacao', 'Enviou uma redação', 30, r.enviada_em, r.enviada_em
from public.redacoes r join public.perfis p on p.id = r.aluno_id and p.papel = 'aluno'
on conflict (aluno_id, chave) do nothing;

insert into public.xp_eventos (aluno_id, chave, tipo, descricao, xp, criado_em, atualizado_em)
select t.aluno_id, 'trilha:' || t.conteudo, 'trilha', 'Concluiu um conteúdo da trilha', 15, t.atualizado_em, t.atualizado_em
from public.trilha_conteudos t join public.perfis p on p.id = t.aluno_id and p.papel = 'aluno'
where t.progresso >= 100
on conflict (aluno_id, chave) do nothing;
