-- Assessoria J&C — FEEDBACK ANÔNIMO (página pública /feedback). Já aplicado no banco. Pode rodar de novo.
create table if not exists public.feedbacks (
  id            uuid primary key default gen_random_uuid(),
  criado_em     timestamptz not null default now(),
  mais_gostou   text not null default '' check (char_length(mais_gostou) <= 1500),
  menos_gostou  text not null default '' check (char_length(menos_gostou) <= 1500),
  continuaria   text check (continuaria in ('sim', 'talvez', 'nao')),
  anonimo       boolean not null default true,
  nome          text check (char_length(nome) <= 80),
  check ((anonimo and nome is null) or (not anonimo and char_length(trim(coalesce(nome, ''))) between 2 and 80)),
  check (char_length(trim(mais_gostou)) > 0 or char_length(trim(menos_gostou)) > 0 or continuaria is not null)
);
create index if not exists feedbacks_data_idx on public.feedbacks (criado_em desc);
alter table public.feedbacks enable row level security;
drop policy if exists "feedbacks: enviar" on public.feedbacks;
create policy "feedbacks: enviar" on public.feedbacks for insert to anon, authenticated with check (true);
drop policy if exists "feedbacks: ceo" on public.feedbacks;
create policy "feedbacks: ceo" on public.feedbacks for select to authenticated using (public.eh_ceo());
drop policy if exists "feedbacks: ceo apaga" on public.feedbacks;
create policy "feedbacks: ceo apaga" on public.feedbacks for delete to authenticated using (public.eh_ceo());
grant insert on public.feedbacks to anon, authenticated;
grant select, delete on public.feedbacks to authenticated;
create or replace function public._limite_feedbacks()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.feedbacks where criado_em > now() - interval '10 minutes') >= 40 then
    raise exception 'Muitos envios agora. Tente de novo em alguns minutos.';
  end if;
  new.id := gen_random_uuid();
  new.criado_em := now();
  new.mais_gostou := trim(new.mais_gostou);
  new.menos_gostou := trim(new.menos_gostou);
  new.nome := case when new.anonimo then null else left(trim(new.nome), 80) end;
  return new;
end $$;
revoke execute on function public._limite_feedbacks() from public, anon, authenticated;
drop trigger if exists limite_feedbacks on public.feedbacks;
create trigger limite_feedbacks before insert on public.feedbacks for each row execute function public._limite_feedbacks();
