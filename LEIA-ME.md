# Mentoria ENEM — como colocar o site no ar

O site tem:

- **Tela de login** com sua foto, @ do Instagram e uma faixa com fotos das aulas.
- **Aba "Horário de estudos"**: a semana do aluno organizada por dia e por cor de matéria, com o dia de hoje destacado e o total de horas.
- **Aba "Simulados"**: o aluno lança os acertos de Linguagens, Humanas, Natureza e Matemática (0 a 45) e a nota da redação (0 a 1000). Aparecem os últimos resultados, as médias, gráficos de evolução e a tabela completa.
- **Painel do mentor**: você escolhe o aluno numa lista e vê/edita o horário e os simulados dele.

**Quem vê o quê** (as regras ficam no banco de dados, então não dá para burlar pelo navegador):

| | Aluno | Você (mentor) |
|---|---|---|
| Horário | vê só o próprio, não edita | vê e edita o de todos |
| Simulados | vê, lança, edita e apaga os próprios | vê e edita os de todos |
| Outros alunos | não vê nada | vê todos |

Custo: Supabase e Vercel são gratuitos para esse tamanho de uso.

---

## Passo 1 — Criar o banco no Supabase (10 min)

1. Entre em **supabase.com** → **New project**. Dê um nome (ex.: `mentoria-enem`), crie uma senha do banco e escolha a região **South America (São Paulo)**.
2. Quando o projeto terminar de criar, vá em **SQL Editor → New query**, cole **todo** o conteúdo do arquivo `supabase/schema.sql` e clique em **Run**. Deve aparecer "Success".
3. Vá em **Authentication → Sign In / Providers** (ou *Providers → Email*) e **desligue "Allow new users to sign up"**. Assim só entra quem você cadastrar.

## Passo 2 — Criar a SUA conta e virar mentor

1. **Authentication → Users → Add user → Create new user**. Coloque seu e-mail e uma senha e marque **Auto Confirm User**.
2. Volte no **SQL Editor** e rode (trocando o e-mail):

   ```sql
   update public.perfis set papel = 'mentor', nome = 'Jarlan'
   where email = 'seu-email@exemplo.com';
   ```

## Passo 3 — Colocar o site no ar (Vercel)

1. Crie um repositório no GitHub e envie esta pasta (sem a pasta `node_modules`).
2. Em **vercel.com → Add New → Project**, importe o repositório. O Vercel reconhece sozinho que é um projeto Vite.
3. Antes de clicar em Deploy, abra **Environment Variables** e adicione as duas variáveis (pegue os valores no Supabase em **Project Settings → API**):

   | Nome | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | o "Project URL" |
   | `VITE_SUPABASE_ANON_KEY` | a chave **anon public** |

   ⚠️ Use só a chave **anon public**. Nunca coloque a chave `service_role` no site.
4. Clique em **Deploy**. Em um minuto você recebe o link (algo como `mentoria-enem.vercel.app`). Dá para trocar por um domínio próprio depois, em *Settings → Domains*.

## Passo 4 — Cadastrar um aluno

1. Supabase → **Authentication → Users → Add user → Create new user**.
2. Coloque o e-mail que você criou para ele e uma senha, marque **Auto Confirm User**.
3. No site, clique em **Atualizar lista**: o aluno aparece no seletor. Use **Editar nome** para colocar o nome completo.
4. Mande para o aluno o link do site, o e-mail e a senha. Ele pode trocar a senha depois pelo botão **Trocar senha**.

> Dica: o e-mail não precisa existir de verdade (pode ser `maria.eduarda@mentoria.com`), já que a conta é confirmada manualmente. Só lembre que, se o aluno esquecer a senha, é você quem redefine em *Authentication → Users → (aluno) → Reset password / Update user*.

## Passo 5 — Montar o horário

No site, logado como mentor: escolha o aluno → aba **Horário de estudos** → preencha dia, início, fim, matéria e o que estudar → **Adicionar**. Depois de adicionar, o formulário já fica pronto para o próximo bloco, começando no horário em que o anterior terminou. Cada bloco tem **editar** e **remover**.

---

## Personalizar

Tudo fica no arquivo `src/constants.js`:

- `NOME_SITE`, `NOME_MENTOR`, `INSTAGRAM` e a frase da tela de login.
- A lista de **matérias** e suas cores.
- As fotos: `public/foto-perfil.jpg` (retrato da tela de login), `public/foto-mentor.jpg` (foto redonda do topo) e `public/aulas/aula-1.jpg` a `aula-8.jpg` (faixa de fotos). Para trocar, é só substituir os arquivos mantendo os nomes. Para tirar a faixa de fotos, deixe `FOTOS_AULAS = []`.

As cores do site ficam no começo de `src/styles.css` (`--primaria` é o verde).

## Testar no seu computador (opcional)

Precisa do Node.js instalado.

```bash
npm install
cp .env.example .env      # e preencha as duas variáveis
npm run dev               # abre em http://localhost:5173
```
