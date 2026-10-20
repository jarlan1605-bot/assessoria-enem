# Mentoria ENEM — guia do site

## O que o site tem

**Para quem ainda não é aluno**
- **Página de vendas**: é a primeira tela de quem abre o site sem estar logado. Mostra seus planos, os depoimentos e as fotos das aulas, com botões para o WhatsApp e o Instagram. Você edita tudo na aba *Página de vendas*.

**Para o aluno**
- Comunidade · **Aulas e mentorias** (vídeos) · Marcar aula (com botão para adicionar ao Google Agenda) · Relatório mensal
- **Minha Trilha** · **Onde estão seus pontos** · Evolução (com metas) · Horário (com check-in diário) · Simulados · **Banco de questões** · Caderno de erros · Redação
- Contagem regressiva do ENEM, que cada aluno pode **ocultar** ou mostrar quando quiser (pelo botão "Ocultar" ou em *Meu perfil*).

**Para o mentor**
- Tudo o que o aluno vê, só que dos próprios alunos, e mais: montar horários, abrir a agenda, corrigir redações e escrever a "Palavra do mentor" no relatório.
- Aba **Meus alunos**: cadastra os próprios alunos, troca a senha deles e **suspende ou reativa o acesso** de quem não pagou. O mentor não vê nem mexe nos alunos dos outros mentores.

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
7. `questoes.sql`
8. `cobrancas.sql`
9. `cobranca_auto.sql`
10. `videoaulas.sql`
11. `acesso.sql`
12. `horario_meses.sql`
13. `trilha.sql` ← o novo (Minha Trilha)

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
2. **Financeiro**: em **⚙️ Pix e mensagens**, cadastre sua chave Pix. Depois, em cada aluno, clique em "definir data" e coloque o valor e a data do último pagamento.
3. **Depoimentos**: só publique depoimentos reais, com autorização do aluno.
4. **Avise os alunos** sobre as novidades: check-in no horário, caderno de erros e envio de redação. Uma publicação na Comunidade resolve.

---

## Como algumas coisas funcionam

- **Minha Trilha**: aba em Estudos com o checklist de todos os conteúdos do roteiro Bernoulli (Biologia, Química, Física, Matemática, História, Geografia e Português; os módulos divididos em partes viraram um conteúdo só). Para cada conteúdo, o aluno arrasta o andamento de 0 a 100% (ou toca no círculo para marcar como concluído) e, tocando no nome, abre os detalhes: quando viu, como se sentiu (😫 a 🤩), questões certas / total (com os botões "+1 acertei" e "+1 errei") e anotações. Os anéis de cada matéria e da trilha toda se atualizam na hora, com níveis (🌱 Começando → 🏆 Dominado). O quadro **"Onde o rendimento está mais baixo"** mostra sozinho os conteúdos com menos de 70% de acerto (a partir de 5 questões). Os conteúdos que mais caem no ENEM (Raio X SAS) aparecem com o nome em destaque e o selo **👁️ Cai muito**. Conteúdos vistos há mais de 30 dias e ainda não dominados ganham o aviso **⏰ revisar**. O botão **📸 Compartilhar progresso** gera uma imagem no formato do Instagram. O mentor vê e pode ajustar a trilha de cada aluno. A lista de conteúdos fica no arquivo `conteudos.js`.
- **Horário por mês**: no topo da aba Horário há um seletor de mês (‹ Outubro de 2026 ›). Cada mês tem o seu horário: montar o de novembro não apaga o de outubro, e dá para voltar a qualquer mês para ver como era. Num mês ainda vazio aparece o botão **Copiar o horário de (mês anterior)**, para não começar do zero. Enquanto o mês atual não tiver horário, o aluno continua vendo o do último mês montado.
- **Repetir blocos**: ao adicionar um bloco, marque vários dias de uma vez (ou use os atalhos *Seg a Sex*, *Seg a Sáb*, *Todos*). O bloco é criado em cada dia marcado. Em um bloco que já existe, o botão **repetir** abre o formulário com ele preenchido para você só escolher os outros dias.
- **Observações do horário**: abaixo da grade, um campo de observações para cada mês. O mentor escreve e salva; o aluno lê, e elas também vão junto no texto de "Enviar pelo WhatsApp".
- **Horário proporcional**: cada bloco tem a altura da sua duração (1 hora = 66 px), com uma régua de horas ao lado no computador. Blocos curtos mostram só horário e matéria; passe o mouse (ou toque) para ver tudo, marcar o check-in, editar ou remover.
- **Enviar horário pelo WhatsApp**: botão verde na aba Horário. Gera o texto formatado com o nome do aluno (copiar ou abrir direto no WhatsApp) e uma imagem do horário (baixar ou, no celular, compartilhar).
- **Simulador do ENEM**: aba em Estudos. Igual à sala de prova: sem relógio, só o quadro do aplicador com os horários de 30 em 30 minutos (e o de 15 minutos finais) e quanto falta. Quando um horário passa, ele é riscado. Os horários da última hora ficam rosa e o último, vermelho. O "aplicador" fala os avisos (início, 2 horas, 30 e 15 minutos finais, término). Tem 1º dia (5h30), 2º dia (5h) e treino com tempo livre, pausa, tela cheia (bom para TV) e resumo no final. Cada prova (1º dia, 2º dia e treino) fica guardada separadamente: o aluno pode pausar, fazer a outra e voltar depois, até em outro dia. Se fechar a página no meio, a prova fica pausada até ele voltar (no mesmo aparelho).
- **Check-in**: o aluno marca cada bloco do horário como ✓ feito, ½ parcial ou ✗ não fiz. A % de plano cumprido considera os últimos 7 dias. A sequência conta os dias seguidos com pelo menos 70% do plano cumprido; dias sem estudo planejado não quebram a sequência.
- **Caderno de erros**: cada erro volta para revisão 1 dia depois de registrado, depois em 7 dias e depois em 30. Depois de 3 revisões certas, vira "dominado". Se o aluno clicar em "Ainda erro", a contagem recomeça.
- **Redação**: o aluno envia a foto ou o PDF. O mentor corrige com notas de 0 a 200 em cada competência, e a nota vai sozinha para a Evolução e para as metas de redação. O aluno não consegue mudar a nota.
- **Relatório**: escolha o mês e clique em **Baixar PDF / imprimir**. Na janela que abrir, escolha "Salvar como PDF".
- **Lembrete de aula**: o botão "📅 Google Agenda" coloca a aula na agenda do celular, que avisa antes do horário.
- **Banco de questões**: qualquer mentor (e o CEO) cadastra, edita e importa questões; todos os alunos veem o mesmo banco. O aluno resolve, o site corrige sozinho (o aluno não consegue mudar o resultado) e, se errar, um toque em *Descuido*, *Conteúdo* ou *Lacuna* manda a questão para o caderno de erros. No **Treino**, o aluno sorteia de 5 a 45 questões com os filtros que quiser, no ritmo do ENEM (3 min por questão) ou livre, com correção na hora ou só no final. O desempenho conta a 1ª tentativa de cada questão. Em *Desempenho dos alunos*, o mentor vê a % de acerto de cada aluno por área e os assuntos que ele precisa reforçar.
- **Importar uma prova**: botão **⬆ Importar** → *Escolher pasta* → selecione a pasta descompactada (com o `questoes.json` e as imagens). Importar a mesma prova de novo não duplica: atualiza. Os comentários feitos pelo Claude entram marcados como **a revisar**; o filtro "Só comentários a revisar" mostra quais faltam conferir. Para conferir, abra **editar** e marque "Comentário revisado por mentor".
- **Suspender acesso**: em *Equipe* (CEO) ou *Meus alunos* (mentor), clique em **suspender** na linha do aluno. O login continua existindo, mas ao entrar o aluno só vê o aviso "Acesso suspenso", com um botão para falar no WhatsApp do site. O bloqueio vale no banco de dados, não só na tela: o aluno suspenso não consegue ver nem lançar nada. Nada é apagado. Quando ele pagar, clique em **reativar** e tudo volta como estava. O CEO suspende qualquer aluno; o mentor, só os dele. O filtro "Só suspensos" mostra quem está bloqueado.
- **Onde estão seus pontos**: aba em Estudos. Cruza o caderno de erros com a incidência de cada assunto no ENEM (Raio X ENEM 2009–2025 da SAS, no arquivo `incidencia.js`) e separa em 🔴 *Prioridade máxima* (cai muito e o aluno erra muito), 🟠 *Fique de olho* (cai muito, erra às vezes), 🟡 *Pode esperar* (erra, mas cai pouco) e ⚪ *Fora do Raio X*. "Cai muito" = 0,75 questão por prova ou mais; "erra muito" = 2 erros ou mais ainda não dominados. No caderno de erros, o campo *Assunto* sugere os nomes do Raio X: usar esses nomes deixa o cruzamento mais certeiro (o site também reconhece nomes comuns, como "eletrodinâmica" ou "porcentagem").
- **Aulas e mentorias**: aba no menu *Mentoria*. Clique em **+ Nova aula ou mentoria**, escolha o tipo, dê um título e cole o link do vídeo (YouTube, Google Drive, Vimeo ou Loom: o vídeo toca dentro do site). Matéria, descrição e um link de material de apoio são opcionais. Desmarque "Visível para os alunos" para salvar como rascunho. Dá para editar ou apagar quando quiser. O aluno clica na aula para assistir, marca como assistida e vê o próprio progresso; o mentor vê quantos alunos assistiram cada uma. Como na Comunidade, as aulas do CEO aparecem para todos os alunos e as de um mentor, só para os alunos dele. Dica: no YouTube, publique como **Não listado**; no Drive, deixe o vídeo como **Qualquer pessoa com o link**.
- **Cobrança mensal**: cada aluno paga a cada 1 mês, contando do último pagamento (sempre no mesmo dia do mês). O site mostra em **Cobrar hoje** quem precisa ser cobrado (alguns dias antes, no dia e, se atrasar, de 3 em 3 dias), com um aviso amarelo no topo do site e um número vermelho no menu. O botão **Cobrar no WhatsApp** abre a conversa com a mensagem pronta e o Pix copia e cola com o valor. Quando o aluno pagar, clique em **Já pagou** / **registrar pagamento**: o vencimento anda 1 mês. Com a **cobrança automática** ligada (passo a passo em `WHATSAPP-AUTOMATICO.md`), o próprio site manda as mensagens todo dia por volta das 12h, e você só aparece quando o aluno não paga ("Sua vez").
- **Financeiro**: só o CEO vê. O repasse de cada mentor é uma porcentagem do que foi **recebido** dos alunos dele.

## Personalizar

- Nome do site, seu nome, Instagram e as cores das matérias ficam em `constants.js`.
- As cores do site ficam no começo de `styles.css` (`--primaria` é o verde).
- Fotos: `foto-perfil.jpg` (retrato), `foto-mentor.jpg` (foto redonda) e `aula-1.jpg` a `aula-8.jpg`. Para trocar, substitua os arquivos mantendo os mesmos nomes.

## Observação sobre hospedagem

O plano grátis do Vercel (Hobby) não permite uso comercial. Com a mentoria cobrando mensalidade, o recomendado é o plano Pro (US$ 20 por mês) ou migrar para o Cloudflare Pages.
