-- =====================================================================
-- Mentoria ENEM — RECURSOS NOVOS (caderno de erros, check-in, metas, SISU,
-- redação, relatório, financeiro, página de vendas e contagem do ENEM)
-- Antes, rode (se ainda não rodou): agenda.sql, perfil.sql, comunidade.sql e equipe.sql.
-- Depois rode ESTE arquivo UMA vez: SQL Editor > New query > Run.
-- Ele só ACRESCENTA coisas: não apaga nada do que já existe.
-- =====================================================================

-- ---------- 0) Preferência de cada pessoa: mostrar ou esconder a contagem do ENEM ----------
alter table public.perfis add column if not exists mostrar_contagem boolean not null default true;

-- A pessoa pode mudar no próprio perfil: nome, foto e a contagem
create or replace function public.proteger_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.eh_ceo() then
    return new;
  end if;
  if new.id = auth.uid() then
    if (to_jsonb(new) - 'nome' - 'foto_url' - 'mostrar_contagem')
       is distinct from (to_jsonb(old) - 'nome' - 'foto_url' - 'mostrar_contagem') then
      raise exception 'Você só pode alterar seu nome, sua foto e a contagem do ENEM.';
    end if;
  elsif old.mentor_id = auth.uid() then
    if (to_jsonb(new) - 'nome' - 'limite_mensal') is distinct from (to_jsonb(old) - 'nome' - 'limite_mensal') then
      raise exception 'Você só pode alterar o nome e o limite de aulas dos seus alunos.';
    end if;
  else
    raise exception 'Sem permissão para alterar este perfil.';
  end if;
  new.nome := left(trim(new.nome), 80);
  return new;
end;
$$;

-- ---------- 1) CADERNO DE ERROS ----------
create table if not exists public.erros (
  id               uuid primary key default gen_random_uuid(),
  aluno_id         uuid not null references public.perfis (id) on delete cascade,
  area             text not null check (area in ('linguagens', 'humanas', 'natureza', 'matematica')),
  materia          text not null default '',
  assunto          text not null default '',
  motivo           text not null default 'conteudo' check (motivo in ('conteudo', 'atencao', 'tempo', 'interpretacao', 'chute')),
  origem           text not null default '',
  anotacao         text not null default '',
  revisoes         smallint not null default 0,
  proxima_revisao  date default (current_date + 1),
  dominado         boolean not null default false,
  criado_em        timestamptz not null default now()
);
create index if not exists erros_aluno_idx on public.erros (aluno_id, proxima_revisao);
alter table public.erros enable row level security;
drop policy if exists "erros: tudo" on public.erros;
create policy "erros: tudo" on public.erros
  for all using (public.pode_ver_aluno(aluno_id)) with check (public.pode_ver_aluno(aluno_id));

-- ---------- 2) CHECK-IN DIÁRIO DO HORÁRIO ----------
create table if not exists public.checkins (
  id          uuid primary key default gen_random_uuid(),
  aluno_id    uuid not null references public.perfis (id) on delete cascade,
  horario_id  uuid not null references public.horarios (id) on delete cascade,
  dia         date not null,
  status      text not null check (status in ('feito', 'parcial', 'nao')),
  criado_em   timestamptz not null default now(),
  unique (horario_id, dia)
);
create index if not exists checkins_aluno_idx on public.checkins (aluno_id, dia);
alter table public.checkins enable row level security;
drop policy if exists "checkins: tudo" on public.checkins;
create policy "checkins: tudo" on public.checkins
  for all using (public.pode_ver_aluno(aluno_id))
  with check (
    public.pode_ver_aluno(aluno_id)
    and exists (select 1 from public.horarios h where h.id = horario_id and h.aluno_id = checkins.aluno_id)
  );

-- ---------- 3) METAS ----------
create table if not exists public.metas (
  id         uuid primary key default gen_random_uuid(),
  aluno_id   uuid not null references public.perfis (id) on delete cascade,
  area       text not null check (area in ('linguagens', 'humanas', 'natureza', 'matematica', 'redacao', 'total')),
  alvo       numeric(6,1) not null,
  prazo      date,
  criado_em  timestamptz not null default now()
);
alter table public.metas enable row level security;
drop policy if exists "metas: tudo" on public.metas;
create policy "metas: tudo" on public.metas
  for all using (public.pode_ver_aluno(aluno_id)) with check (public.pode_ver_aluno(aluno_id));

-- ---------- 4) CALCULADORA SISU (cenários salvos) ----------
create table if not exists public.sisu_cenarios (
  id          uuid primary key default gen_random_uuid(),
  aluno_id    uuid not null references public.perfis (id) on delete cascade,
  curso       text not null default '',
  instituicao text not null default '',
  peso_lc     numeric(4,2) not null default 1,
  peso_ch     numeric(4,2) not null default 1,
  peso_cn     numeric(4,2) not null default 1,
  peso_mt     numeric(4,2) not null default 1,
  peso_red    numeric(4,2) not null default 1,
  nota_corte  numeric(6,2),
  nota_lc     numeric(6,1),
  nota_ch     numeric(6,1),
  nota_cn     numeric(6,1),
  nota_mt     numeric(6,1),
  nota_red    numeric(6,1),
  criado_em   timestamptz not null default now()
);
alter table public.sisu_cenarios enable row level security;
drop policy if exists "sisu: tudo" on public.sisu_cenarios;
create policy "sisu: tudo" on public.sisu_cenarios
  for all using (public.pode_ver_aluno(aluno_id)) with check (public.pode_ver_aluno(aluno_id));

-- ---------- 5) REDAÇÕES (envio pelo aluno, correção pelo mentor) ----------
create table if not exists public.redacoes (
  id            uuid primary key default gen_random_uuid(),
  aluno_id      uuid not null references public.perfis (id) on delete cascade,
  tema          text not null default '',
  arquivos      jsonb not null default '[]'::jsonb,  -- [{nome, caminho, tipo}]
  status        text not null default 'enviada' check (status in ('enviada', 'corrigida')),
  c1 smallint check (c1 between 0 and 200),
  c2 smallint check (c2 between 0 and 200),
  c3 smallint check (c3 between 0 and 200),
  c4 smallint check (c4 between 0 and 200),
  c5 smallint check (c5 between 0 and 200),
  comentario    text not null default '',
  corretor_id   uuid references public.perfis (id) on delete set null,
  enviada_em    timestamptz not null default now(),
  corrigida_em  timestamptz
);
create index if not exists redacoes_aluno_idx on public.redacoes (aluno_id, enviada_em desc);
alter table public.redacoes enable row level security;

drop policy if exists "redacoes: ver" on public.redacoes;
create policy "redacoes: ver" on public.redacoes for select using (public.pode_ver_aluno(aluno_id));
drop policy if exists "redacoes: enviar" on public.redacoes;
create policy "redacoes: enviar" on public.redacoes for insert with check (public.pode_ver_aluno(aluno_id));
drop policy if exists "redacoes: editar" on public.redacoes;
create policy "redacoes: editar" on public.redacoes for update
  using (public.pode_ver_aluno(aluno_id)) with check (public.pode_ver_aluno(aluno_id));
drop policy if exists "redacoes: apagar" on public.redacoes;
create policy "redacoes: apagar" on public.redacoes for delete
  using (public.pode_gerir_aluno(aluno_id) or (aluno_id = auth.uid() and status = 'enviada'));

-- O aluno não dá nota para si mesmo: notas, comentário e status são só do mentor/CEO
create or replace function public.proteger_redacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.pode_gerir_aluno(new.aluno_id) then
    if new.status = 'corrigida' and (tg_op = 'INSERT' or old.status <> 'corrigida') then
      new.corrigida_em := now();
      new.corretor_id := auth.uid();
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'enviada';
    new.c1 := null; new.c2 := null; new.c3 := null; new.c4 := null; new.c5 := null;
    new.comentario := ''; new.corretor_id := null; new.corrigida_em := null;
    return new;
  end if;
  if old.status <> 'enviada'
     or (to_jsonb(new) - 'tema' - 'arquivos') is distinct from (to_jsonb(old) - 'tema' - 'arquivos') then
    raise exception 'Depois de corrigida, a redação não pode ser alterada pelo aluno.';
  end if;
  return new;
end;
$$;
drop trigger if exists proteger_redacao on public.redacoes;
create trigger proteger_redacao before insert or update on public.redacoes
  for each row execute function public.proteger_redacao();

-- Pasta privada das redações: redacoes/<id-do-aluno>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('redacoes', 'redacoes', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.pasta_de_aluno_visivel(p text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if p is null then return false; end if;
  if p = auth.uid()::text or public.eh_ceo() then return true; end if;
  if p ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return public.e_meu_aluno(p::uuid);
  end if;
  return false;
end;
$$;

drop policy if exists "redacoes: ver arquivos" on storage.objects;
create policy "redacoes: ver arquivos" on storage.objects for select to authenticated
  using (bucket_id = 'redacoes' and public.pasta_de_aluno_visivel((storage.foldername(name))[1]));
drop policy if exists "redacoes: enviar arquivos" on storage.objects;
create policy "redacoes: enviar arquivos" on storage.objects for insert to authenticated
  with check (bucket_id = 'redacoes' and public.pasta_de_aluno_visivel((storage.foldername(name))[1]));
drop policy if exists "redacoes: apagar arquivos" on storage.objects;
create policy "redacoes: apagar arquivos" on storage.objects for delete to authenticated
  using (bucket_id = 'redacoes' and public.pasta_de_aluno_visivel((storage.foldername(name))[1]));

-- ---------- 6) RELATÓRIO MENSAL: comentário do mentor ----------
create table if not exists public.relatorios (
  aluno_id       uuid not null references public.perfis (id) on delete cascade,
  mes            date not null,             -- sempre o dia 1 do mês
  comentario     text not null default '',
  autor_id       uuid references public.perfis (id) on delete set null default auth.uid(),
  atualizado_em  timestamptz not null default now(),
  primary key (aluno_id, mes)
);
alter table public.relatorios enable row level security;
drop policy if exists "relatorios: ver" on public.relatorios;
create policy "relatorios: ver" on public.relatorios for select using (public.pode_ver_aluno(aluno_id));
drop policy if exists "relatorios: escrever" on public.relatorios;
create policy "relatorios: escrever" on public.relatorios for insert with check (public.pode_gerir_aluno(aluno_id));
drop policy if exists "relatorios: editar" on public.relatorios;
create policy "relatorios: editar" on public.relatorios for update
  using (public.pode_gerir_aluno(aluno_id)) with check (public.pode_gerir_aluno(aluno_id));

-- ---------- 7) FINANCEIRO (só o CEO vê) ----------
create table if not exists public.contratos (
  aluno_id        uuid primary key references public.perfis (id) on delete cascade,
  valor_mensal    numeric(10,2) not null default 0,
  dia_vencimento  smallint not null default 10 check (dia_vencimento between 1 and 28),
  responsavel     text not null default '',
  telefone        text not null default '',
  observacoes     text not null default ''
);
create table if not exists public.repasses (
  mentor_id  uuid primary key references public.perfis (id) on delete cascade,
  percentual numeric(5,2) not null default 0 check (percentual between 0 and 100)
);
create table if not exists public.mensalidades (
  id           uuid primary key default gen_random_uuid(),
  aluno_id     uuid not null references public.perfis (id) on delete cascade,
  competencia  date not null,               -- dia 1 do mês de referência
  valor        numeric(10,2) not null,
  vencimento   date not null,
  pago_em      date,
  forma        text not null default '',
  observacoes  text not null default '',
  unique (aluno_id, competencia)
);
alter table public.contratos enable row level security;
alter table public.repasses enable row level security;
alter table public.mensalidades enable row level security;
drop policy if exists "contratos: ceo" on public.contratos;
create policy "contratos: ceo" on public.contratos for all using (public.eh_ceo()) with check (public.eh_ceo());
drop policy if exists "repasses: ceo" on public.repasses;
create policy "repasses: ceo" on public.repasses for all using (public.eh_ceo()) with check (public.eh_ceo());
drop policy if exists "mensalidades: ceo" on public.mensalidades;
create policy "mensalidades: ceo" on public.mensalidades for all using (public.eh_ceo()) with check (public.eh_ceo());

-- ---------- 8) PÁGINA DE VENDAS E DATA DO ENEM ----------
create table if not exists public.site_config (
  id          smallint primary key default 1 check (id = 1),
  data_enem_1 timestamptz,
  data_enem_2 timestamptz,
  titulo      text not null default '',
  subtitulo   text not null default '',
  whatsapp    text not null default '',
  instagram   text not null default '',
  planos      jsonb not null default '[]'::jsonb,     -- [{nome, preco, destaque, itens:[...]}]
  numeros     jsonb not null default '[]'::jsonb,     -- [{valor, rotulo}]
  atualizado_em timestamptz not null default now()
);
insert into public.site_config (id, data_enem_1, data_enem_2, titulo, subtitulo, instagram, planos)
values (
  1,
  '2026-11-08 13:30:00-03',
  '2026-11-15 13:30:00-03',
  'Sua aprovação com um plano feito para você',
  'Mentoria para o ENEM com horário de estudos personalizado, simulados acompanhados de perto e aulas individuais.',
  'jarlanamed',
  '[{"nome":"Mentoria até o ENEM","preco":"","destaque":true,"itens":["Horário de estudos personalizado","Simulados semanais com correção","Suporte diário pelo WhatsApp","Aulas individuais com o mentor","Caderno de erros e evolução no site"]}]'::jsonb
)
on conflict (id) do nothing;

alter table public.site_config enable row level security;
drop policy if exists "site: todos leem" on public.site_config;
create policy "site: todos leem" on public.site_config for select using (true);
drop policy if exists "site: ceo edita" on public.site_config;
create policy "site: ceo edita" on public.site_config for update using (public.eh_ceo()) with check (public.eh_ceo());
grant select on public.site_config to anon;

create table if not exists public.depoimentos (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  resultado  text not null default '',   -- ex.: "Aprovada em Medicina — UFRN"
  texto      text not null,
  foto_url   text,
  publicado  boolean not null default false,
  ordem      smallint not null default 0,
  criado_em  timestamptz not null default now()
);
alter table public.depoimentos enable row level security;
drop policy if exists "depoimentos: ver publicados" on public.depoimentos;
create policy "depoimentos: ver publicados" on public.depoimentos for select using (publicado or public.eh_ceo());
drop policy if exists "depoimentos: ceo edita" on public.depoimentos;
create policy "depoimentos: ceo edita" on public.depoimentos for all using (public.eh_ceo()) with check (public.eh_ceo());
grant select on public.depoimentos to anon;

-- Pasta pública de imagens do site (fotos dos depoimentos); só o CEO envia
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site', 'site', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true;
drop policy if exists "site: ceo envia" on storage.objects;
create policy "site: ceo envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'site' and public.eh_ceo());
drop policy if exists "site: ceo apaga" on storage.objects;
create policy "site: ceo apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'site' and public.eh_ceo());
drop policy if exists "site: ceo lista" on storage.objects;
create policy "site: ceo lista" on storage.objects for select to authenticated
  using (bucket_id = 'site' and public.eh_ceo());
