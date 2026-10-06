# Mentoria ENEM — guia do site

## O que o site tem

**Para quem ainda não é aluno**
- **Página de vendas**: é a primeira tela de quem abre o site sem estar logado. Mostra seus planos, os depoimentos e as fotos das aulas, com botões para o WhatsApp e o Instagram. Você edita tudo na aba *Página de vendas*.

**Para o aluno**
- Comunidade · Marcar aula (com botão para adicionar ao Google Agenda) · Relatório mensal
- Evolução (com metas) · Horário (com check-in diário) · Simulados · **Banco de questões** · Caderno de erros · Redação
- Contagem regressiva do ENEM, que cada aluno pode **ocultar** ou mostrar quando quiser (pelo botão "Ocultar" ou em *Meu perfil*).

**Para o mentor**
- Tudo o que o aluno vê, só que dos próprios alunos, e mais: montar horários, abrir a agenda, corrigir redações e escrever a "Palavra do mentor" no relatório.

**Para você (CEO)**
- Tudo o que o mentor tem, de todos os alunos, e mais as abas **Equipe**, **Financeiro** e **Página de vendas**.

---

## Atualizar o site que já está no ar

### 1) Supabase → SQL Editor
Rode, **nesta ordem**, os arquivos que ainda não rodou. Cada um só acrescenta coisas e pode ser rodado de novo sem problema.

1. `agenda.sql`
2. `perfil.sql`
3. `comunidade.sql`
4. `equipe.sql`
5. `extras.sql`
6. `detalhes.sql`
7. `questoes.sql` ← o novo (banco de questões)

### 2) GitHub → enviar os arquivos
**Add file → Upload files**, selecione todos os arquivos soltos desta pasta e clique em **Commit changes**. Os arquivos com o mesmo nome são substituídos.

### 3) A função de cadastro (só se ainda não fez)
**Add file → Create new file**, digite o nome `api/usuarios.js`, cole o conteúdo do arquivo `usuarios.js` e clique em **Commit changes**.

### 4) Vercel → Environment Variables
| Nome | Valor | Tipo |
|---|---|---|
| `VITE_SUPABASE_URL` | Project URL do Supabase | Config |
| `VITE_SUPABASE_ANON_KEY` | anon / publishable key | Config |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key | Secret |

Depois de mexer nas variáveis, faça **Redeploy**.

---

## Primeiros passos depois de atualizar

1. **Página de vendas**: coloque seu WhatsApp, revise o texto e os planos (o preço é opcional) e confira a data do ENEM.
2. **Financeiro**: em cada aluno, clique em "definir valor". Depois, todo mês, clique em **Gerar cobranças do mês**.
3. **Depoimentos**: só publique depoimentos reais, com autorização do aluno.
4. **Avise os alunos** sobre as novidades: check-in no horário, caderno de erros e envio de redação. Uma publicação na Comunidade resolve.

---

## Como algumas coisas funcionam

- **Check-in**: o aluno marca cada bloco do horário como ✓ feito, ½ parcial ou ✗ não fiz. A % de plano cumprido considera os últimos 7 dias. A sequência conta os dias seguidos com pelo menos 70% do plano cumprido; dias sem estudo planejado não quebram a sequência.
- **Caderno de erros**: cada erro volta para revisão 1 dia depois de registrado, depois em 7 dias e depois em 30. Depois de 3 revisões certas, vira "dominado". Se o aluno clicar em "Ainda erro", a contagem recomeça.
- **Redação**: o aluno envia a foto ou o PDF. O mentor corrige com notas de 0 a 200 em cada competência, e a nota vai sozinha para a Evolução e para as metas de redação. O aluno não consegue mudar a nota.
- **Relatório**: escolha o mês e clique em **Baixar PDF / imprimir**. Na janela que abrir, escolha "Salvar como PDF".
- **Lembrete de aula**: o botão "📅 Google Agenda" coloca a aula na agenda do celular, que avisa antes do horário.
- **Banco de questões**: qualquer mentor (e o CEO) cadastra, edita e importa questões; todos os alunos veem o mesmo banco. O aluno resolve, o site corrige sozinho (o aluno não consegue mudar o resultado) e, se errar, um toque em *Descuido*, *Conteúdo* ou *Lacuna* manda a questão para o caderno de erros. No **Treino**, o aluno sorteia de 5 a 45 questões com os filtros que quiser, no ritmo do ENEM (3 min por questão) ou livre, com correção na hora ou só no final. O desempenho conta a 1ª tentativa de cada questão. Em *Desempenho dos alunos*, o mentor vê a % de acerto de cada aluno por área e os assuntos que ele precisa reforçar.
- **Importar uma prova**: botão **⬆ Importar** → *Escolher pasta* → selecione a pasta descompactada (com o `questoes.json` e as imagens). Importar a mesma prova de novo não duplica: atualiza. Os comentários feitos pelo Claude entram marcados como **a revisar**; o filtro "Só comentários a revisar" mostra quais faltam conferir. Para conferir, abra **editar** e marque "Comentário revisado por mentor".
- **Financeiro**: só o CEO vê. O repasse de cada mentor é uma porcentagem do que foi **recebido** dos alunos dele.

## Personalizar

- Nome do site, seu nome, Instagram e as cores das matérias ficam em `constants.js`.
- As cores do site ficam no começo de `styles.css` (`--primaria` é o verde).
- Fotos: `foto-perfil.jpg` (retrato), `foto-mentor.jpg` (foto redonda) e `aula-1.jpg` a `aula-8.jpg`. Para trocar, substitua os arquivos mantendo os mesmos nomes.

## Observação sobre hospedagem

O plano grátis do Vercel (Hobby) não permite uso comercial. Com a mentoria cobrando mensalidade, o recomendado é o plano Pro (US$ 20 por mês) ou migrar para o Cloudflare Pages.
