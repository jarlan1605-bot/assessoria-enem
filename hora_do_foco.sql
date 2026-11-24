-- =====================================================================
-- Assessoria J&C — HORA DO FOCO (cronômetro de estudo no topo do site)
-- O aluno liga e desliga. O tempo é conferido pelo banco:
--  * enquanto está ligado, o site manda um "sinal" a cada minuto;
--  * se o aluno fechar o site, para sozinho (no último sinal);
--  * se o celular ficar bloqueado/em outro app com o cronômetro ligado, o tempo conta
--    quando ele voltar (até 3 horas sem sinal; mais que isso não conta).
-- XP por dia, em faixas: pouco tempo = pouco XP, 5h = médio, 10h = muito.
-- Rodar depois de xp.sql e gamificacao.sql. Pode rodar de novo sem erro.
-- =====================================================================

create table if not exists public.estudo_sessoes (
  id            uuid primary key default gen_random_uuid(),
  aluno_id      uuid not null references public.perfis (id) on delete cascade,
  inicio        timestamptz not null default now(),
  ultimo_sinal  timestamptz not null default now(),
  fim           timestamptz
);
create index if not exists estudo_sessoes_aluno_idx on public.estudo_sessoes (aluno_id, inicio desc);
create index if not exists estudo_sessoes_abertas_idx on public.estudo_sessoes (aluno_id) where fim is null;
alter table public.estudo_sessoes enable row level security;
drop policy if exists "estudo: ver" on public.estudo_sessoes;
create policy "estudo: ver" on public.estudo_sessoes for select using (public.pode_ver_aluno(aluno_id));
-- gravar só pelas funções abaixo

-- Minutos estudados num dia (sessão conta no dia em que começou; máximo 16h por dia)
create or replace function public._minutos_estudo(p_aluno uuid, p_dia date)
returns int language sql stable security definer set search_path = public as $$
  select least(960, coalesce(sum(greatest(0, extract(epoch from (coalesce(s.fim, s.ultimo_sinal) - s.inicio)) / 60)), 0))::int
  from public.estudo_sessoes s
  where s.aluno_id = p_aluno and (s.inicio at time zone 'America/Sao_Paulo')::date = p_dia;
$$;
revoke execute on function public._minutos_estudo(uuid, date) from public, anon, authenticated;

-- XP do dia: 6 XP por hora + bônus nas faixas (1h +10, 3h +30, 5h +60, 8h +100, 10h +200)
-- 1h = 16 XP · 3h = 58 · 5h = 130 · 8h = 248 · 10h = 460
create or replace function public._xp_estudo(p_aluno uuid, p_dia date)
returns void language plpgsql security definer set search_path = public as $$
declare m int := public._minutos_estudo(p_aluno, p_dia); xp int;
begin
  xp := (m / 10)  -- 1 XP a cada 10 min
      + case when m >= 60 then 10 else 0 end
      + case when m >= 180 then 30 else 0 end
      + case when m >= 300 then 60 else 0 end
      + case when m >= 480 then 100 else 0 end
      + case when m >= 600 then 200 else 0 end;
  perform public._dar_xp(p_aluno, 'estudo:' || p_dia, 'estudo',
    'Hora do foco: ' || (m / 60) || 'h' || lpad((m % 60)::text, 2, '0') || ' de estudo no dia', xp);
end $$;
revoke execute on function public._xp_estudo(uuid, date) from public, anon, authenticated;

-- Situação de hoje: total estudado e se há cronômetro ligado
create or replace function public.estudo_hoje(p_aluno uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a uuid := coalesce(p_aluno, auth.uid()); ab public.estudo_sessoes;
begin
  if a is null or not public.pode_ver_aluno(a) then return null; end if;
  select * into ab from public.estudo_sessoes where aluno_id = a and fim is null order by inicio desc limit 1;
  return jsonb_build_object(
    'minutos', public._minutos_estudo(a, public.hoje_br()),
    'aberta', case when ab.id is null then null else jsonb_build_object('id', ab.id, 'inicio', ab.inicio, 'ultimo_sinal', ab.ultimo_sinal) end,
    'agora', now());
end $$;
revoke execute on function public.estudo_hoje(uuid) from public, anon;
grant execute on function public.estudo_hoje(uuid) to authenticated;

-- Liga o cronômetro (fecha qualquer outro que tenha ficado aberto, no último sinal)
create or replace function public.iniciar_estudo()
returns jsonb language plpgsql security definer set search_path = public as $$
declare eu uuid := auth.uid(); r record; novo public.estudo_sessoes;
begin
  if eu is null or not exists (select 1 from public.perfis where id = eu and papel = 'aluno' and not coalesce(suspenso, false)) then
    raise exception 'Só alunos usam a Hora do foco.';
  end if;
  for r in update public.estudo_sessoes set fim = least(ultimo_sinal, inicio + interval '12 hours')
           where aluno_id = eu and fim is null returning inicio loop
    perform public._xp_estudo(eu, (r.inicio at time zone 'America/Sao_Paulo')::date);
  end loop;
  insert into public.estudo_sessoes (aluno_id) values (eu) returning * into novo;
  return jsonb_build_object('id', novo.id, 'inicio', novo.inicio, 'agora', now());
end $$;
revoke execute on function public.iniciar_estudo() from public, anon;
grant execute on function public.iniciar_estudo() to authenticated;

-- Sinal de vida (a cada minuto e quando o aluno volta ao site). Devolve false se a sessão já acabou.
create or replace function public.sinal_estudo(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare eu uuid := auth.uid(); s public.estudo_sessoes;
begin
  select * into s from public.estudo_sessoes where id = p_id and aluno_id = eu and fim is null;
  if s.id is null then return false; end if;
  if now() - s.ultimo_sinal > interval '3 hours' or now() - s.inicio > interval '12 hours' then
    update public.estudo_sessoes set fim = least(ultimo_sinal, inicio + interval '12 hours') where id = s.id;
    perform public._xp_estudo(eu, (s.inicio at time zone 'America/Sao_Paulo')::date);
    return false;
  end if;
  update public.estudo_sessoes set ultimo_sinal = now() where id = s.id;
  perform public._xp_estudo(eu, (s.inicio at time zone 'America/Sao_Paulo')::date);
  return true;
end $$;
revoke execute on function public.sinal_estudo(uuid) from public, anon;
grant execute on function public.sinal_estudo(uuid) to authenticated;

-- Desliga. p_agora = true: o aluno tocou em parar (conta até agora).
--          p_agora = false: o site foi fechado/reaberto (conta só até o último sinal).
create or replace function public.parar_estudo(p_id uuid, p_agora boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare eu uuid := auth.uid(); s public.estudo_sessoes; f timestamptz;
begin
  select * into s from public.estudo_sessoes where id = p_id and aluno_id = eu and fim is null;
  if s.id is null then return null; end if;
  f := case when p_agora and now() - s.ultimo_sinal <= interval '3 hours' then now() else s.ultimo_sinal end;
  f := least(f, s.inicio + interval '12 hours');
  update public.estudo_sessoes set fim = f, ultimo_sinal = greatest(ultimo_sinal, f) where id = s.id;
  perform public._xp_estudo(eu, (s.inicio at time zone 'America/Sao_Paulo')::date);
  return jsonb_build_object('minutos_sessao', round(extract(epoch from (f - s.inicio)) / 60), 'minutos_hoje', public._minutos_estudo(eu, public.hoje_br()));
end $$;
revoke execute on function public.parar_estudo(uuid, boolean) from public, anon;
grant execute on function public.parar_estudo(uuid, boolean) to authenticated;

-- O dia com 30+ min de Hora do foco também conta na ofensiva
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
  select m.dia from public.missoes_dia m where m.aluno_id = p_aluno and m.feitas >= 1
  union
  select (es.inicio at time zone 'America/Sao_Paulo')::date from public.estudo_sessoes es where es.aluno_id = p_aluno
    group by 1 having sum(extract(epoch from (coalesce(es.fim, es.ultimo_sinal) - es.inicio))) >= 1800;
end $$;
revoke execute on function public._dias_estudo(uuid) from public, anon, authenticated;
