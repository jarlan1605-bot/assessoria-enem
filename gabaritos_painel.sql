-- =====================================================================
-- Assessoria J&C — CARTÃO-RESPOSTA DE SIMULADOS EXTERNOS (SAS etc.) e PAINEL
-- 1) A equipe cadastra só o GABARITO de um simulado (sem as questões).
--    O aluno marca o cartão-resposta e o banco corrige na hora.
--    O gabarito fica escondido dos alunos até eles entregarem.
-- 2) Tempo na plataforma (para o painel do aluno).
-- Pode rodar de novo sem problema. Rode depois de xp.sql.
-- =====================================================================

create table if not exists public.gabaritos_externos (
  id               uuid primary key default gen_random_uuid(),
  titulo           text not null check (char_length(titulo) between 2 and 120),
  numero_inicial   integer not null default 1 check (numero_inicial between 1 and 180),
  gabarito         text not null check (gabarito ~ '^[A-EX]{1,180}$'),
  gabarito_ingles  text check (gabarito_ingles is null or gabarito_ingles ~ '^[A-EX]{5}$'),
  gabarito_espanhol text check (gabarito_espanhol is null or gabarito_espanhol ~ '^[A-EX]{5}$'),
  areas            jsonb not null default '[]'::jsonb,   -- [{"area":"natureza","de":91,"ate":135}, ...]
  ativo            boolean not null default true,
  criado_por       uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em        timestamptz not null default now()
);
alter table public.gabaritos_externos enable row level security;
drop policy if exists "gabaritos: equipe" on public.gabaritos_externos;
create policy "gabaritos: equipe" on public.gabaritos_externos for all using (public.eh_mentor()) with check (public.eh_mentor());

create table if not exists public.gabarito_respostas (
  id           uuid primary key default gen_random_uuid(),
  aluno_id     uuid not null references public.perfis (id) on delete cascade,
  gabarito_id  uuid not null references public.gabaritos_externos (id) on delete cascade,
  titulo       text not null default '',
  lingua       text,
  respostas    jsonb not null default '{}'::jsonb,       -- {"91":"A", ...}
  correcao     jsonb not null default '{}'::jsonb,       -- gabarito usado na correção (aparece depois de entregar)
  acertos      integer not null default 0,
  total        integer not null default 0,
  respondidas  integer not null default 0,
  por_area     jsonb not null default '{}'::jsonb,
  tempo_min    integer check (tempo_min is null or tempo_min between 1 and 900),
  enviado_em   timestamptz not null default now(),
  unique (aluno_id, gabarito_id)
);
alter table public.gabarito_respostas enable row level security;
drop policy if exists "gabarito_respostas: ver" on public.gabarito_respostas;
create policy "gabarito_respostas: ver" on public.gabarito_respostas for select using (public.pode_ver_aluno(aluno_id));
drop policy if exists "gabarito_respostas: equipe apaga" on public.gabarito_respostas;
create policy "gabarito_respostas: equipe apaga" on public.gabarito_respostas for delete using (public.eh_mentor() and public.pode_ver_aluno(aluno_id));

-- Lista para os alunos (sem o gabarito)
create or replace function public.gabaritos_disponiveis()
returns table (id uuid, titulo text, numero_inicial integer, n integer, areas jsonb, tem_lingua boolean, ativo boolean, minha_resposta uuid)
language sql stable security definer set search_path = public as $$
  select g.id, g.titulo, g.numero_inicial, char_length(g.gabarito), g.areas,
         (g.gabarito_ingles is not null or g.gabarito_espanhol is not null), g.ativo, r.id
  from public.gabaritos_externos g
  left join public.gabarito_respostas r on r.gabarito_id = g.id and r.aluno_id = auth.uid()
  where auth.uid() is not null and (g.ativo or r.id is not null)
  order by g.criado_em desc;
$$;

-- Entregar o cartão-resposta e corrigir
create or replace function public.entregar_gabarito(p_gabarito uuid, p_respostas jsonb, p_lingua text default null, p_tempo_min integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.gabaritos_externos; gab text; i integer; num integer; certa text; marcada text;
        ac integer := 0; tot integer := 0; resp integer := 0; por jsonb := '{}'::jsonb; area text; corr jsonb := '{}'::jsonb; rid uuid;
begin
  if auth.uid() is null then raise exception 'Faça login.'; end if;
  select * into g from public.gabaritos_externos where id = p_gabarito and ativo;
  if not found then raise exception 'Simulado não encontrado.'; end if;
  if exists (select 1 from public.gabarito_respostas where aluno_id = auth.uid() and gabarito_id = g.id) then
    raise exception 'Você já entregou este simulado.';
  end if;
  gab := g.gabarito;
  if p_lingua = 'espanhol' and g.gabarito_espanhol is not null then gab := g.gabarito_espanhol || substr(gab, 6);
  elsif g.gabarito_ingles is not null then gab := g.gabarito_ingles || substr(gab, 6);
  end if;
  for i in 1 .. char_length(gab) loop
    num := g.numero_inicial + i - 1;
    certa := substr(gab, i, 1);
    marcada := upper(coalesce(p_respostas ->> num::text, ''));
    corr := corr || jsonb_build_object(num::text, certa);
    area := null;
    select a ->> 'area' into area from jsonb_array_elements(g.areas) a
      where num between (a ->> 'de')::int and (a ->> 'ate')::int limit 1;
    area := coalesce(area, 'geral');
    if marcada in ('A', 'B', 'C', 'D', 'E') then resp := resp + 1; end if;
    if certa <> 'X' then
      tot := tot + 1;
      por := jsonb_set(por, array[area], jsonb_build_object(
        'acertos', coalesce((por -> area ->> 'acertos')::int, 0) + case when marcada = certa then 1 else 0 end,
        'total', coalesce((por -> area ->> 'total')::int, 0) + 1));
      if marcada = certa then ac := ac + 1; end if;
    end if;
  end loop;
  insert into public.gabarito_respostas (aluno_id, gabarito_id, titulo, lingua, respostas, correcao, acertos, total, respondidas, por_area, tempo_min)
  values (auth.uid(), g.id, g.titulo, p_lingua, coalesce(p_respostas, '{}'::jsonb), corr, ac, tot, resp, por,
          case when p_tempo_min between 1 and 900 then p_tempo_min end)
  returning id into rid;
  return jsonb_build_object('id', rid, 'acertos', ac, 'total', tot, 'respondidas', resp, 'por_area', por);
end $$;

-- XP do cartão-resposta (mesma regra do Simulado ENEM)
create or replace function public._xp_gabarito()
returns trigger language plpgsql security definer set search_path = public as $$
declare n integer; bonus integer := 0;
begin
  n := (select count(*) from jsonb_object_keys(new.correcao));
  if n >= 80 and new.respondidas >= n * 0.8 then bonus := 100; elsif n >= 40 and new.respondidas >= n * 0.8 then bonus := 40; end if;
  perform public._dar_xp(new.aluno_id, 'gabarito:' || new.id, 'simulado', left('Simulado: ' || new.titulo, 140),
    2 * new.acertos + greatest(new.respondidas - new.acertos, 0) + bonus);
  return null;
end $$;
drop trigger if exists xp_gabarito on public.gabarito_respostas;
create trigger xp_gabarito after insert on public.gabarito_respostas for each row execute function public._xp_gabarito();

-- Tempo na plataforma (o site manda a cada minuto enquanto a aba está aberta e visível)
create table if not exists public.tempo_plataforma (
  aluno_id  uuid not null references public.perfis (id) on delete cascade,
  dia       date not null,
  segundos  integer not null default 0 check (segundos between 0 and 86400),
  primary key (aluno_id, dia)
);
alter table public.tempo_plataforma enable row level security;
drop policy if exists "tempo: ver" on public.tempo_plataforma;
create policy "tempo: ver" on public.tempo_plataforma for select using (public.pode_ver_aluno(aluno_id));

create or replace function public.registrar_tempo(p_segundos integer)
returns void language plpgsql security definer set search_path = public as $$
declare s integer := least(greatest(coalesce(p_segundos, 0), 0), 120); d date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if auth.uid() is null or s = 0 then return; end if;
  insert into public.tempo_plataforma (aluno_id, dia, segundos) values (auth.uid(), d, s)
  on conflict (aluno_id, dia) do update set segundos = least(public.tempo_plataforma.segundos + excluded.segundos, 86400);
end $$;

revoke execute on function public.gabaritos_disponiveis() from public, anon;
revoke execute on function public.entregar_gabarito(uuid, jsonb, text, integer) from public, anon;
revoke execute on function public.registrar_tempo(integer) from public, anon;
grant execute on function public.gabaritos_disponiveis() to authenticated;
grant execute on function public.entregar_gabarito(uuid, jsonb, text, integer) to authenticated;
grant execute on function public.registrar_tempo(integer) to authenticated;
