-- =====================================================================
-- Mentoria ENEM — NOME E FOTO DE PERFIL (atualização)
-- Rode este arquivo UMA vez no Supabase: SQL Editor > New query > Run.
-- Ele só ACRESCENTA coisas: não apaga nada do que já existe.
-- =====================================================================

-- 1) Endereço da foto de cada pessoa
alter table public.perfis add column if not exists foto_url text;

-- 2) Cada pessoa pode editar o PRÓPRIO perfil...
drop policy if exists "perfis: editar o próprio" on public.perfis;
create policy "perfis: editar o próprio" on public.perfis
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ...mas o aluno só consegue mudar NOME e FOTO.
-- (papel, e-mail e limite de aulas continuam só com o mentor;
--  comandos rodados por você aqui no SQL Editor não são bloqueados)
create or replace function public.proteger_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.eh_mentor() then
    return new;
  end if;
  if (to_jsonb(new) - 'nome' - 'foto_url') is distinct from (to_jsonb(old) - 'nome' - 'foto_url') then
    raise exception 'Você só pode alterar seu nome e sua foto.';
  end if;
  new.nome := left(trim(new.nome), 80);
  return new;
end;
$$;

drop trigger if exists proteger_perfil on public.perfis;
create trigger proteger_perfil
  before update on public.perfis
  for each row execute function public.proteger_perfil();

-- 3) Foto do mentor visível para todos (aparece no topo do site e na tela de login)
create or replace function public.foto_do_mentor()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select foto_url from public.perfis
  where papel = 'mentor' and foto_url is not null
  order by criado_em
  limit 1;
$$;
grant execute on function public.foto_do_mentor() to anon, authenticated;

-- 4) Pasta de fotos (Supabase Storage): imagens de até 2 MB, leitura pública.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Cada pessoa só mexe na própria subpasta (avatars/<id-da-pessoa>/...)
drop policy if exists "avatars: ver a própria pasta" on storage.objects;
create policy "avatars: ver a própria pasta" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: enviar na própria pasta" on storage.objects;
create policy "avatars: enviar na própria pasta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: alterar na própria pasta" on storage.objects;
create policy "avatars: alterar na própria pasta" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: apagar da própria pasta" on storage.objects;
create policy "avatars: apagar da própria pasta" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
