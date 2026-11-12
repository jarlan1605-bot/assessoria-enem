-- =====================================================================
-- Assessoria J&C — VISÃO GERAL DOS ALUNOS (para o CEO e mentores)
-- Uma linha por aluno com todas as métricas. O CEO vê todos;
-- o mentor vê só os alunos dele (pode_ver_aluno). Rode depois de gabaritos_painel.sql.
-- =====================================================================
create or replace function public.metricas_alunos()
returns table (
  aluno_id uuid, nome text, email text, foto_url text, mentor_id uuid, suspenso boolean, criado_em timestamptz,
  q_hoje integer, q_semana integer, q_mes integer, q_ano integer, q_total integer,
  a_mes integer, n_mes integer, a_total integer, n_total integer,
  tempo_hoje integer, tempo_semana integer, tempo_mes integer, tempo_total integer,
  xp_semana integer, xp_total integer, pos_semana integer, pos_geral integer,
  checkins_semana integer, checkins_mes integer, checkins_total integer,
  trilha_soma integer, trilha_concluidos integer,
  simulados_completos integer, simulados_total integer, ultimo_simulado text, ultimo_simulado_nota text,
  erros_pendentes integer, ultima_atividade timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  sem date := hoje - ((extract(isodow from hoje)::int) - 1);
  mes date := date_trunc('month', hoje)::date;
  ano date := date_trunc('year', hoje)::date;
begin
  if not public.eh_mentor() then raise exception 'Só a equipe vê isso.'; end if;
  return query
  with alunos as (
    select p.* from public.perfis p where p.papel = 'aluno' and public.pode_ver_aluno(p.id)
  ),
  lotes as (
    select r.aluno_id, (r.criado_em at time zone 'America/Sao_Paulo')::date dia, 1 n, case when r.correta then 1 else 0 end a, 1 na, r.criado_em quando
      from public.respostas r join alunos al on al.id = r.aluno_id
    union all
    select t.aluno_id, (t.enviado_em at time zone 'America/Sao_Paulo')::date,
           (select count(*) from jsonb_object_keys(coalesce(t.respostas, '{}'::jsonb)))::int,
           coalesce(sr.acertos, 0), case when sr.tentativa_id is null then 0 else (select count(*) from jsonb_object_keys(coalesce(t.respostas, '{}'::jsonb)))::int end, t.enviado_em
      from public.simulado_tentativas t join alunos al on al.id = t.aluno_id
      left join public.simulado_resultados sr on sr.tentativa_id = t.id
      where t.enviado_em is not null
    union all
    select g.aluno_id, (g.enviado_em at time zone 'America/Sao_Paulo')::date, g.respondidas, g.acertos, g.respondidas, g.enviado_em
      from public.gabarito_respostas g join alunos al on al.id = g.aluno_id
  ),
  q as (
    select l.aluno_id,
      sum(l.n) filter (where l.dia = hoje)::int q_hoje,
      sum(l.n) filter (where l.dia >= sem)::int q_semana,
      sum(l.n) filter (where l.dia >= mes)::int q_mes,
      sum(l.n) filter (where l.dia >= ano)::int q_ano,
      sum(l.n)::int q_total,
      sum(l.a) filter (where l.dia >= mes)::int a_mes, sum(l.na) filter (where l.dia >= mes)::int n_mes,
      sum(l.a)::int a_total, sum(l.na)::int n_total,
      max(l.quando) ultima
    from lotes l group by l.aluno_id
  ),
  tp as (
    select t.aluno_id,
      sum(t.segundos) filter (where t.dia = hoje)::int th, sum(t.segundos) filter (where t.dia >= sem)::int ts,
      sum(t.segundos) filter (where t.dia >= mes)::int tm, sum(t.segundos)::int tt
    from public.tempo_plataforma t join alunos al on al.id = t.aluno_id group by t.aluno_id
  ),
  xp as (
    select p.id aluno_id,
      coalesce(sum(e.xp) filter (where (e.criado_em at time zone 'America/Sao_Paulo')::date >= sem), 0)::int xs,
      coalesce(sum(e.xp), 0)::int xt, max(e.criado_em) ultima
    from public.perfis p left join public.xp_eventos e on e.aluno_id = p.id
    where p.papel = 'aluno' and coalesce(p.suspenso, false) = false
    group by p.id
  ),
  rk as (
    select x.aluno_id, x.xs, x.xt, x.ultima,
      (rank() over (order by x.xs desc))::int ps, (rank() over (order by x.xt desc))::int pg
    from xp x
  ),
  ck as (
    select c.aluno_id,
      count(*) filter (where c.status = 'feito' and c.dia >= sem)::int cs,
      count(*) filter (where c.status = 'feito' and c.dia >= mes)::int cm,
      count(*) filter (where c.status = 'feito')::int ct
    from public.checkins c join alunos al on al.id = c.aluno_id group by c.aluno_id
  ),
  tr as (
    select t.aluno_id, sum(t.progresso)::int soma, count(*) filter (where t.progresso = 100)::int feitos
    from public.trilha_conteudos t join alunos al on al.id = t.aluno_id group by t.aluno_id
  ),
  sims as (
    select t.aluno_id, t.titulo, t.enviado_em quando,
           coalesce(array_length(t.questao_ids, 1), 0) >= 80 completo,
           case when sr.tentativa_id is null then 'aguardando' else sr.acertos || '/' || sr.total end nota
      from public.simulado_tentativas t join alunos al on al.id = t.aluno_id
      left join public.simulado_resultados sr on sr.tentativa_id = t.id
      where t.enviado_em is not null
    union all
    select g.aluno_id, g.titulo, g.enviado_em, (select count(*) from jsonb_object_keys(g.correcao)) >= 80, g.acertos || '/' || g.total
      from public.gabarito_respostas g join alunos al on al.id = g.aluno_id
  ),
  sm as (
    select s.aluno_id, count(*) filter (where s.completo)::int comp, count(*)::int tot,
           (array_agg(s.titulo order by s.quando desc))[1] ult, (array_agg(s.nota order by s.quando desc))[1] ultn
    from sims s group by s.aluno_id
  ),
  er as (
    select e.aluno_id, count(*) filter (where not coalesce(e.dominado, false) and e.proxima_revisao <= hoje)::int pend
    from public.erros e join alunos al on al.id = e.aluno_id group by e.aluno_id
  )
  select al.id, al.nome, al.email, al.foto_url, al.mentor_id, coalesce(al.suspenso, false), al.criado_em,
    coalesce(q.q_hoje, 0), coalesce(q.q_semana, 0), coalesce(q.q_mes, 0), coalesce(q.q_ano, 0), coalesce(q.q_total, 0),
    coalesce(q.a_mes, 0), coalesce(q.n_mes, 0), coalesce(q.a_total, 0), coalesce(q.n_total, 0),
    coalesce(tp.th, 0), coalesce(tp.ts, 0), coalesce(tp.tm, 0), coalesce(tp.tt, 0),
    coalesce(rk.xs, 0), coalesce(rk.xt, 0), rk.ps, rk.pg,
    coalesce(ck.cs, 0), coalesce(ck.cm, 0), coalesce(ck.ct, 0),
    coalesce(tr.soma, 0), coalesce(tr.feitos, 0),
    coalesce(sm.comp, 0), coalesce(sm.tot, 0), sm.ult, sm.ultn,
    coalesce(er.pend, 0),
    greatest(q.ultima, rk.ultima)
  from alunos al
  left join q on q.aluno_id = al.id
  left join tp on tp.aluno_id = al.id
  left join rk on rk.aluno_id = al.id
  left join ck on ck.aluno_id = al.id
  left join tr on tr.aluno_id = al.id
  left join sm on sm.aluno_id = al.id
  left join er on er.aluno_id = al.id
  order by coalesce(rk.xs, 0) desc, al.nome;
end $$;
revoke execute on function public.metricas_alunos() from public, anon;
grant execute on function public.metricas_alunos() to authenticated;
