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
