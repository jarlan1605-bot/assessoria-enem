-- =====================================================================
-- Assessoria J&C — SIMULADO ENEM NA PLATAFORMA
-- 1) Simulado agendado: o CEO/mentor marca dia, hora e duração; todos os alunos
--    fazem no mesmo horário (quem chega atrasado perde o tempo), e o resultado
--    só aparece para o aluno quando for liberado.
-- 2) Simulado livre: o aluno escolhe uma prova do banco, a parte (dia/área) e o
--    tempo; o resultado sai assim que ele entrega.
-- A correção é feita no banco de dados, e nada pode ser enviado depois do tempo.
-- Pode rodar de novo sem problema.
-- =====================================================================

create table if not exists public.simulados_agendados (
  id                 uuid primary key default gen_random_uuid(),
  titulo             text not null check (char_length(titulo) between 2 and 120),
  prova              text not null default '',
  composicao         text not null default '',
  questao_ids        uuid[] not null,
  inicio             timestamptz not null,
  duracao_min        integer not null check (duracao_min between 10 and 600),
  resultado_liberado boolean not null default false,
  criado_por         uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em          timestamptz not null default now()
);
alter table public.simulados_agendados enable row level security;
-- Só a equipe lê a tabela direto (as questões ficam escondidas dos alunos até a hora da prova)
drop policy if exists "agendados: equipe" on public.simulados_agendados;
create policy "agendados: equipe" on public.simulados_agendados for all
  using (public.eh_mentor()) with check (public.eh_mentor());

create table if not exists public.simulado_tentativas (
  id           uuid primary key default gen_random_uuid(),
  aluno_id     uuid not null references public.perfis (id) on delete cascade,
  agendado_id  uuid references public.simulados_agendados (id) on delete cascade,
  titulo       text not null default '',
  prova        text not null default '',
  composicao   text not null default '',
  questao_ids  uuid[] not null,
  inicio       timestamptz not null default now(),
  fim          timestamptz not null,
  respostas    jsonb not null default '{}'::jsonb,
  enviado_em   timestamptz,
  unique (aluno_id, agendado_id)
);
create index if not exists simulado_tentativas_aluno_idx on public.simulado_tentativas (aluno_id, inicio desc);
alter table public.simulado_tentativas enable row level security;
-- Leitura: o próprio aluno e a equipe dele. Escrita só pelas funções abaixo.
drop policy if exists "tentativas: ver" on public.simulado_tentativas;
create policy "tentativas: ver" on public.simulado_tentativas for select using (public.pode_ver_aluno(aluno_id));
drop policy if exists "tentativas: equipe apaga" on public.simulado_tentativas;
create policy "tentativas: equipe apaga" on public.simulado_tentativas for delete using (public.eh_mentor() and public.pode_ver_aluno(aluno_id));

create table if not exists public.simulado_resultados (
  tentativa_id uuid primary key references public.simulado_tentativas (id) on delete cascade,
  aluno_id     uuid not null references public.perfis (id) on delete cascade,
  agendado_id  uuid references public.simulados_agendados (id) on delete cascade,
  acertos      integer not null,
  total        integer not null,
  por_area     jsonb not null default '{}'::jsonb,
  corrigido_em timestamptz not null default now()
);
alter table public.simulado_resultados enable row level security;
-- O aluno só vê a nota do simulado agendado depois que o resultado é liberado
drop policy if exists "resultados: ver" on public.simulado_resultados;
create policy "resultados: ver" on public.simulado_resultados for select using (
  (public.eh_mentor() and public.pode_ver_aluno(aluno_id))
  or (aluno_id = auth.uid() and (agendado_id is null
      or exists (select 1 from public.simulados_agendados a where a.id = agendado_id and a.resultado_liberado)))
);

-- Simulado agendado em andamento agora?
create or replace function public._simulado_ao_vivo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.simulados_agendados
                 where now() >= inicio and now() < inicio + make_interval(mins => duracao_min));
$$;

-- Lista para os alunos: os agendados, sem revelar as questões
create or replace function public.simulados_agendados_lista()
returns table (id uuid, titulo text, prova text, composicao text, inicio timestamptz, duracao_min integer,
               resultado_liberado boolean, n_questoes integer, minha_tentativa uuid, meu_envio timestamptz, agora timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.titulo, a.prova, a.composicao, a.inicio, a.duracao_min, a.resultado_liberado,
         coalesce(array_length(a.questao_ids, 1), 0), t.id, t.enviado_em, now()
  from public.simulados_agendados a
  left join public.simulado_tentativas t on t.agendado_id = a.id and t.aluno_id = auth.uid()
  where auth.uid() is not null
  order by a.inicio desc;
$$;

-- Começar (ou voltar para) o simulado agendado
create or replace function public.iniciar_simulado_agendado(p_agendado uuid)
returns table (tentativa_id uuid, fim timestamptz, agora timestamptz)
language plpgsql security definer set search_path = public as $$
declare a public.simulados_agendados; t uuid; f timestamptz;
begin
  if auth.uid() is null then raise exception 'Faça login.'; end if;
  select * into a from public.simulados_agendados where id = p_agendado;
  if not found then raise exception 'Simulado não encontrado.'; end if;
  f := a.inicio + make_interval(mins => a.duracao_min);
  select st.id into t from public.simulado_tentativas st where st.aluno_id = auth.uid() and st.agendado_id = a.id;
  if t is null then
    if now() < a.inicio then raise exception 'O simulado ainda não começou.'; end if;
    if now() >= f then raise exception 'O tempo deste simulado já acabou.'; end if;
    insert into public.simulado_tentativas (aluno_id, agendado_id, titulo, prova, composicao, questao_ids, inicio, fim)
    values (auth.uid(), a.id, a.titulo, a.prova, a.composicao, a.questao_ids, now(), f)
    returning id into t;
  end if;
  return query select t, f, now();
end $$;

-- Começar um simulado livre (o aluno escolhe a prova, a parte e o tempo)
create or replace function public.iniciar_simulado_livre(p_titulo text, p_prova text, p_composicao text, p_questao_ids uuid[], p_minutos integer)
returns table (tentativa_id uuid, fim timestamptz, agora timestamptz)
language plpgsql security definer set search_path = public as $$
declare t uuid; f timestamptz; n integer;
begin
  if auth.uid() is null then raise exception 'Faça login.'; end if;
  if public._simulado_ao_vivo() and not public.eh_mentor() then
    raise exception 'Agora está acontecendo um simulado agendado. O simulado livre volta quando ele terminar.';
  end if;
  if p_minutos is null or p_minutos < 5 or p_minutos > 600 then raise exception 'Escolha um tempo entre 5 minutos e 10 horas.'; end if;
  n := coalesce(array_length(p_questao_ids, 1), 0);
  if n < 1 or n > 200 then raise exception 'Escolha uma prova com questões.'; end if;
  if (select count(*) from public.questoes where id = any (p_questao_ids)) <> n then raise exception 'Questões inválidas.'; end if;
  f := now() + make_interval(mins => p_minutos);
  insert into public.simulado_tentativas (aluno_id, titulo, prova, composicao, questao_ids, inicio, fim)
  values (auth.uid(), left(coalesce(p_titulo, 'Simulado'), 120), left(coalesce(p_prova, ''), 200), left(coalesce(p_composicao, ''), 40), p_questao_ids, now(), f)
  returning id into t;
  return query select t, f, now();
end $$;

-- Salvar as marcações durante a prova (não vale depois do tempo)
create or replace function public.salvar_respostas_simulado(p_tentativa uuid, p_respostas jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.simulado_tentativas
     set respostas = coalesce(p_respostas, '{}'::jsonb)
   where id = p_tentativa and aluno_id = auth.uid() and enviado_em is null and now() <= fim + interval '30 seconds';
  if not found then raise exception 'O tempo acabou ou a prova já foi entregue.'; end if;
end $$;

-- Entregar e corrigir. Depois do tempo, só vale o que já estava salvo.
create or replace function public.entregar_simulado(p_tentativa uuid, p_respostas jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.simulado_tentativas; resp jsonb; ac integer; tot integer; area_j jsonb; liberado boolean;
begin
  select * into t from public.simulado_tentativas where id = p_tentativa and aluno_id = auth.uid() for update;
  if not found then raise exception 'Prova não encontrada.'; end if;
  if t.enviado_em is null then
    resp := case when p_respostas is not null and now() <= t.fim + interval '60 seconds' then p_respostas else t.respostas end;
    update public.simulado_tentativas set respostas = resp, enviado_em = least(now(), t.fim + interval '60 seconds') where id = t.id;
    with q as (
      select qq.id, qq.area, qq.gabarito::text as gabarito, resp ->> qq.id::text as marcada
      from public.questoes qq where qq.id = any (t.questao_ids)
    ), por as (
      select area, count(*) filter (where gabarito is not null and marcada = gabarito) as a,
             count(*) filter (where gabarito is not null) as n
      from q group by area
    )
    select coalesce(sum(a), 0), coalesce(sum(n), 0), coalesce(jsonb_object_agg(area, jsonb_build_object('acertos', a, 'total', n)), '{}'::jsonb)
      into ac, tot, area_j from por;
    insert into public.simulado_resultados (tentativa_id, aluno_id, agendado_id, acertos, total, por_area)
    values (t.id, t.aluno_id, t.agendado_id, ac, tot, area_j)
    on conflict (tentativa_id) do nothing;
  end if;
  select coalesce(a.resultado_liberado, true) into liberado
  from (select 1) x left join public.simulados_agendados a on a.id = t.agendado_id;
  if t.agendado_id is not null and not liberado then
    return jsonb_build_object('liberado', false);
  end if;
  return (select jsonb_build_object('liberado', true, 'acertos', r.acertos, 'total', r.total, 'por_area', r.por_area)
          from public.simulado_resultados r where r.tentativa_id = t.id);
end $$;

revoke execute on function public._simulado_ao_vivo() from public, anon;
revoke execute on function public.simulados_agendados_lista() from public, anon;
revoke execute on function public.iniciar_simulado_agendado(uuid) from public, anon;
revoke execute on function public.iniciar_simulado_livre(text, text, text, uuid[], integer) from public, anon;
revoke execute on function public.salvar_respostas_simulado(uuid, jsonb) from public, anon;
revoke execute on function public.entregar_simulado(uuid, jsonb) from public, anon;
grant execute on function public._simulado_ao_vivo() to authenticated;
grant execute on function public.simulados_agendados_lista() to authenticated;
grant execute on function public.iniciar_simulado_agendado(uuid) to authenticated;
grant execute on function public.iniciar_simulado_livre(text, text, text, uuid[], integer) to authenticated;
grant execute on function public.salvar_respostas_simulado(uuid, jsonb) to authenticated;
grant execute on function public.entregar_simulado(uuid, jsonb) to authenticated;
