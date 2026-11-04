-- =====================================================================
-- Assessoria J&C — O CEO EDITA OS MENTORES (página de mentores e escolha do assessor)
-- Campos novos: aprovação, quantas questões fez e área de especialidade.
-- O CEO também pode trocar a foto de qualquer mentor.
-- Pode rodar de novo sem problema. Rode depois de mentores.sql.
-- =====================================================================

alter table public.perfis add column if not exists aprovacao text not null default '';
alter table public.perfis add column if not exists questoes_feitas integer check (questoes_feitas between 0 and 1000000);
alter table public.perfis add column if not exists especialidade text not null default '';
alter table public.perfis drop constraint if exists perfis_mentor_textos;
alter table public.perfis add constraint perfis_mentor_textos check (char_length(aprovacao) <= 120 and char_length(especialidade) <= 80);

-- O que os visitantes veem de cada mentor (agora com aprovação, questões e especialidade)
drop function if exists public.mentores_publicos();
create function public.mentores_publicos()
returns table (id uuid, nome text, foto_url text, papel text, idade int, naturalidade text, caracteristicas text[], legenda text, disponivel boolean, aprovacao text, questoes_feitas int, especialidade text)
language sql stable security definer set search_path = public as $$
  select id, nome, foto_url, papel,
         case when nascimento is null then null else extract(year from age(nascimento))::int end,
         naturalidade, caracteristicas, legenda, disponivel, aprovacao, questoes_feitas, especialidade
  from public.perfis
  where papel in ('mentor', 'ceo') and vitrine
  order by (papel = 'ceo') desc, disponivel desc, criado_em;
$$;
revoke execute on function public.mentores_publicos() from public;
grant execute on function public.mentores_publicos() to anon, authenticated;

-- O CEO envia e troca a foto de qualquer pessoa (a pasta de cada um continua só dela para os demais)
drop policy if exists "avatars: ceo envia" on storage.objects;
create policy "avatars: ceo envia" on storage.objects for insert with check (bucket_id = 'avatars' and public.eh_ceo());
drop policy if exists "avatars: ceo ve" on storage.objects;
create policy "avatars: ceo ve" on storage.objects for select using (bucket_id = 'avatars' and public.eh_ceo());
drop policy if exists "avatars: ceo apaga" on storage.objects;
create policy "avatars: ceo apaga" on storage.objects for delete using (bucket_id = 'avatars' and public.eh_ceo());

-- O próprio mentor também pode editar os campos novos em "Meu perfil"
create or replace function public.proteger_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.eh_ceo() then
    if new.suspenso is distinct from old.suspenso then
      new.suspenso_em := case when new.suspenso then now() else null end;
    end if;
    return new;
  end if;
  if new.id = auth.uid() then
    if public.eh_mentor() then
      if (to_jsonb(new) - 'nome' - 'foto_url' - 'mostrar_contagem' - 'vitrine' - 'nascimento' - 'naturalidade' - 'caracteristicas' - 'legenda' - 'disponivel' - 'aprovacao' - 'questoes_feitas' - 'especialidade')
         is distinct from (to_jsonb(old) - 'nome' - 'foto_url' - 'mostrar_contagem' - 'vitrine' - 'nascimento' - 'naturalidade' - 'caracteristicas' - 'legenda' - 'disponivel' - 'aprovacao' - 'questoes_feitas' - 'especialidade') then
        raise exception 'Você só pode alterar seu nome, sua foto, a contagem do ENEM e os dados da página de mentores.';
      end if;
    elsif (to_jsonb(new) - 'nome' - 'foto_url' - 'mostrar_contagem')
       is distinct from (to_jsonb(old) - 'nome' - 'foto_url' - 'mostrar_contagem') then
      raise exception 'Você só pode alterar seu nome, sua foto e a contagem do ENEM.';
    end if;
  elsif old.mentor_id = auth.uid() then
    if (to_jsonb(new) - 'nome' - 'limite_mensal' - 'suspenso' - 'suspenso_em')
       is distinct from (to_jsonb(old) - 'nome' - 'limite_mensal' - 'suspenso' - 'suspenso_em') then
      raise exception 'Você só pode alterar o nome, o limite de aulas e a suspensão dos seus alunos.';
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
  return new;
end;
$$;
