-- =====================================================================
-- Mentoria ENEM — MENTORES NA PÁGINA DE APRESENTAÇÃO
-- Cada mentor preenche, em "Meu perfil", o que aparece para os visitantes:
-- data de nascimento (o site mostra só a idade), naturalidade, características,
-- uma legenda escrita por ele e se está com vagas.
-- Pode rodar de novo sem problema. Rode depois de equipe.sql e perfil.sql.
-- =====================================================================

alter table public.perfis add column if not exists vitrine boolean not null default false;
alter table public.perfis add column if not exists nascimento date;
alter table public.perfis add column if not exists naturalidade text not null default '';
alter table public.perfis add column if not exists caracteristicas text[] not null default '{}';
alter table public.perfis add column if not exists legenda text not null default '';
alter table public.perfis add column if not exists disponivel boolean not null default true;

alter table public.perfis drop constraint if exists perfis_vitrine_tamanhos;
alter table public.perfis add constraint perfis_vitrine_tamanhos check (
  char_length(naturalidade) <= 80 and char_length(legenda) <= 400 and cardinality(caracteristicas) <= 8
);

-- O que os visitantes (sem login) podem ver: só os mentores que escolheram aparecer,
-- e só estes campos. A data de nascimento nunca sai daqui, só a idade.
create or replace function public.mentores_publicos()
returns table (id uuid, nome text, foto_url text, papel text, idade int, naturalidade text, caracteristicas text[], legenda text, disponivel boolean)
language sql stable security definer set search_path = public as $$
  select id, nome, foto_url, papel,
         case when nascimento is null then null else extract(year from age(nascimento))::int end,
         naturalidade, caracteristicas, legenda, disponivel
  from public.perfis
  where papel in ('mentor', 'ceo') and vitrine
  order by (papel = 'ceo') desc, disponivel desc, criado_em;
$$;
revoke execute on function public.mentores_publicos() from public;
grant execute on function public.mentores_publicos() to anon, authenticated;

-- O mentor pode editar os próprios dados da vitrine (o aluno continua só com nome, foto e contagem)
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
      if (to_jsonb(new) - 'nome' - 'foto_url' - 'mostrar_contagem' - 'vitrine' - 'nascimento' - 'naturalidade' - 'caracteristicas' - 'legenda' - 'disponivel')
         is distinct from (to_jsonb(old) - 'nome' - 'foto_url' - 'mostrar_contagem' - 'vitrine' - 'nascimento' - 'naturalidade' - 'caracteristicas' - 'legenda' - 'disponivel') then
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
