-- Endurecimento de segurança e desempenho (já aplicado no banco em 24/11/2026). Pode rodar de novo.
-- 1) Funções de gatilho não ficam expostas na API
revoke execute on function public._xp_checkin(), public._xp_gabarito(), public._xp_redacao(), public._xp_resposta(), public._xp_revisao(),
  public._xp_simulado(), public._xp_trilha(), public.carimbar_questao(), public.corrigir_resposta(), public.criar_perfil_novo_usuario(),
  public.proteger_perfil(), public.proteger_redacao() from public, anon, authenticated;
-- 2) Funções auxiliares de permissão só para quem está logado
revoke execute on function public.papel_de(uuid), public.pode_gerir_aluno(uuid), public.pode_ver_aluno(uuid), public.e_meu_aluno(uuid),
  public.meu_mentor_id(), public.pasta_de_aluno_visivel(text) from public, anon;
grant execute on function public.papel_de(uuid), public.pode_gerir_aluno(uuid), public.pode_ver_aluno(uuid), public.e_meu_aluno(uuid),
  public.meu_mentor_id(), public.pasta_de_aluno_visivel(text) to authenticated;
-- 3) Foco: não registra sessão antes do tempo dela passar desde a última
create or replace function public.registrar_foco(p_materia text, p_minutos integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare eu uuid := auth.uid(); m int := least(greatest(coalesce(p_minutos, 0), 0), 60); novo uuid; ja int; ultima timestamptz;
begin
  if eu is null or m < 1 then return null; end if;
  if not exists (select 1 from public.perfis where id = eu and papel = 'aluno' and not coalesce(suspenso, false)) then return null; end if;
  select max(criado_em) into ultima from public.sessoes_foco where aluno_id = eu;
  if ultima is not null and now() - ultima < make_interval(secs => m * 60 - 20) then
    raise exception 'Sessão registrada cedo demais: termine o tempo do cronômetro.';
  end if;
  select coalesce(sum(minutos), 0) into ja from public.sessoes_foco
   where aluno_id = eu and (criado_em at time zone 'America/Sao_Paulo')::date = public.hoje_br();
  if ja + m > 960 then raise exception 'Limite de foco do dia atingido.'; end if;
  insert into public.sessoes_foco (aluno_id, materia, minutos) values (eu, left(trim(coalesce(p_materia, '')), 60), m) returning id into novo;
  perform public._dar_xp(eu, 'foco:' || novo, 'foco', left('Foco: ' || coalesce(nullif(trim(p_materia), ''), 'estudo') || ' · ' || m || ' min', 140), greatest(1, (m / 5) * 2));
  return jsonb_build_object('id', novo, 'minutos', m);
end $$;
revoke execute on function public.registrar_foco(text, integer) from public, anon;
grant execute on function public.registrar_foco(text, integer) to authenticated;
-- 4) Regras de acesso mais rápidas: auth.uid() avaliado uma vez por consulta
do $$
declare r record; q text; w text;
begin
  for r in select tablename, policyname, qual, with_check from pg_policies
           where schemaname = 'public' and (qual ~ '(?<!SELECT )auth\.uid\(\)' or with_check ~ '(?<!SELECT )auth\.uid\(\)') loop
    q := regexp_replace(r.qual, '(?<!SELECT )auth\.uid\(\)', '(select auth.uid())', 'g');
    w := regexp_replace(r.with_check, '(?<!SELECT )auth\.uid\(\)', '(select auth.uid())', 'g');
    if r.qual is not null and r.with_check is not null then
      execute format('alter policy %I on public.%I using (%s) with check (%s)', r.policyname, r.tablename, q, w);
    elsif r.qual is not null then
      execute format('alter policy %I on public.%I using (%s)', r.policyname, r.tablename, q);
    else
      execute format('alter policy %I on public.%I with check (%s)', r.policyname, r.tablename, w);
    end if;
  end loop;
end $$;
