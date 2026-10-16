# Cobrança automática pelo WhatsApp — passo a passo

Todo dia, por volta das 12h (horário de Brasília, entre 12h e 12h59), o site manda sozinho pelo WhatsApp oficial da mentoria:

- **Lembrete** alguns dias antes do vencimento (você escolhe quantos);
- **Aviso no dia** do vencimento;
- **Aviso de atraso** (3 dias depois, ou o que você escolher).

Toda mensagem vai com o **Pix copia e cola com o valor já preenchido**.
Se o aluno não pagar, ele aparece no Financeiro em **"👤 Sua vez"** e você cobra pessoalmente.
O site nunca manda a mesma mensagem duas vezes para o mesmo vencimento.

**Custo:** a Meta cobra cerca de **US$ 0,008 por mensagem** (uns 5 centavos de real). Com 20 alunos, fica abaixo de R$ 5 por mês. O agendamento no Vercel é grátis.

---

## Antes de começar: qual número usar?

O envio automático precisa do **WhatsApp oficial da Meta (API)**. São dois caminhos:

**A) Um chip novo só para a cobrança (recomendado para começar).** É o mais simples e o mais barato.
O número novo fica só com o robô e não aparece em nenhum aplicativo. Por isso as mensagens dizem
"mande o comprovante para o WhatsApp (seu número atual)". As respostas dos alunos chegam no seu WhatsApp de sempre.

**B) O mesmo número do seu WhatsApp Business.** A Meta permite usar o mesmo número no aplicativo
e no envio automático ao mesmo tempo (chamado de "coexistência"), mas a ativação é feita por uma
empresa parceira da Meta, que normalmente cobra mensalidade. Se quiser esse caminho, me avise:
o site precisa de um pequeno ajuste para o parceiro escolhido.

Este passo a passo é do **caminho A**.

---

## 1) Chip

Compre um chip de qualquer operadora, coloque num celular e confirme que ele recebe SMS.
Não instale o WhatsApp nesse número.

## 2) Criar o app na Meta

1. Entre em **developers.facebook.com** com o seu Facebook e clique em **Meus apps → Criar app**.
2. Escolha o caso de uso **"Conectar-se com clientes pelo WhatsApp"** (ou tipo **Empresa**).
3. Quando pedir um **portfólio empresarial** (Business Manager), crie um com o nome da mentoria.
4. No app, abra **WhatsApp → Configuração da API**.

## 3) Colocar o número

1. Em **Configuração da API**, clique em **Adicionar número de telefone**.
2. Nome de exibição: o nome da mentoria (ex.: *Mentoria ENEM Jarlan*). A Meta revisa esse nome.
3. Coloque o número do chip e confirme pelo código do SMS.
4. Copie o **"Identificação do número de telefone"** (Phone number ID). Esse é o `WHATSAPP_PHONE_ID`.

## 4) Forma de pagamento

**business.facebook.com → WhatsApp Manager → Visão geral → Configurações de pagamento → Adicionar forma de pagamento.**
Sem isso, a Meta não envia as mensagens.

## 5) Token permanente (a "senha" do robô)

1. **business.facebook.com → Configurações do negócio → Usuários → Usuários do sistema → Adicionar.**
   Nome: *robo-cobranca*. Função: **Administrador**.
2. Clique no usuário criado, depois em **Atribuir ativos**:
   - **Apps**: o app que você criou, com **controle total**;
   - **Contas do WhatsApp**: a conta da mentoria, com **controle total**.
3. Clique em **Gerar novo token**:
   - app: o seu;
   - validade: **Nunca**;
   - permissões: `whatsapp_business_messaging` e `whatsapp_business_management`.
4. Copie o token **na hora** (ele só aparece uma vez). Esse é o `WHATSAPP_TOKEN`.
   **Não mande esse token para ninguém**, nem por mensagem.

## 6) Modelos de mensagem (precisam ser aprovados pela Meta)

**WhatsApp Manager → Modelos de mensagem → Criar modelo.** Crie os 3 abaixo:
- categoria: **Utilidade**;
- idioma: **Português (BR)**;
- **nome exatamente igual** ao indicado.

Troque *Mentoria ENEM* e o número entre parênteses pelos seus.
Em "amostras de variáveis", a Meta pede exemplos: use *Ana*, *R$ 350,00*, *10/11/2026* e um código Pix qualquer.

**Nome: `lembrete_mensalidade`**
```
Olá, {{1}}! Passando para lembrar que a mensalidade da Mentoria ENEM, no valor de {{2}}, vence em {{3}}.

Para pagar com Pix, copie o código abaixo e cole no app do seu banco, na opção Pix Copia e Cola:
{{4}}

Depois de pagar, mande o comprovante para o WhatsApp (84) 99999-9999. Se já pagou, desconsidere esta mensagem.
```

**Nome: `mensalidade_vence_hoje`**
```
Olá, {{1}}! A mensalidade da Mentoria ENEM, no valor de {{2}}, vence hoje ({{3}}).

Pix Copia e Cola:
{{4}}

Depois de pagar, mande o comprovante para o WhatsApp (84) 99999-9999. Obrigado!
```

**Nome: `mensalidade_em_aberto`**
```
Olá, {{1}}! Consta em aberto a mensalidade da Mentoria ENEM no valor de {{2}}, com vencimento em {{3}}.

Pix Copia e Cola:
{{4}}

Se já pagou, mande o comprovante para o WhatsApp (84) 99999-9999 para atualizarmos. Obrigado!
```

As variáveis são preenchidas pelo site:
- **{{1}}**: o nome de quem paga (o responsável, se tiver cadastrado; senão, o aluno);
- **{{2}}**: o valor;
- **{{3}}**: o vencimento;
- **{{4}}**: o Pix copia e cola.

A aprovação costuma levar de alguns minutos a algumas horas.
Se a Meta recusar, mude um pouco o texto e envie de novo. Se mudar o nome do modelo,
coloque o nome novo no site (Financeiro → Pix e mensagens).

## 7) Vercel

1. **Vercel → seu projeto → Settings → Environment Variables**. Adicione:

   | Nome | Valor | Tipo |
   |---|---|---|
   | `WHATSAPP_TOKEN` | o token do passo 5 | **Secret** |
   | `WHATSAPP_PHONE_ID` | o número do passo 3 | Secret |
   | `CRON_SECRET` | uma senha longa qualquer, inventada por você (ex.: 40 letras e números) | Secret |

   A `SUPABASE_SERVICE_ROLE_KEY` você já tem desde o cadastro de alunos.
2. No GitHub, envie os arquivos da atualização, incluindo **`vercel.json`** (na raiz) e
   **`api/cobranca-automatica.js`** (use *Add file → Create new file* com esse nome, como fez com `api/usuarios.js`).
3. Faça **Redeploy**. Em **Settings → Cron Jobs**, deve aparecer `/api/cobranca-automatica` todo dia às 15:00 UTC (12h de Brasília).

## 8) Supabase

Rode o arquivo **`cobranca_auto.sql`** no SQL Editor.

## 9) Ligar no site

1. **Financeiro → ⚙️ Pix e mensagens.** Confira se a chave Pix está cadastrada.
2. Em **🤖 Cobrança automática**, coloque o **seu** WhatsApp e clique em **Enviar teste**.
   Tem que chegar no seu celular a mensagem com o Pix de R$ 1,00. Teste os três modelos.
3. Marque **Ligar a cobrança automática** e clique em **Salvar**.
4. Clique em **Quem recebe hoje?** para ver quem vai receber na próxima rodada (sem enviar nada).
5. Confira se todo aluno tem o **WhatsApp de quem paga** cadastrado (em *contrato*). Quem não tiver aparece em "Sua vez".

Pronto. A partir daí, o site manda sozinho todo dia ao meio-dia.
No Financeiro, cada aluno mostra o que o robô já mandou (🤖 lembrete ✓, 🤖 no dia ✓, 🤖 atraso ✓).
Se der erro em algum envio, o aluno aparece em **Sua vez** com "não conseguiu enviar" (passe o mouse para ver o motivo).

---

### Problemas comuns
- **"Template name does not exist"**: o nome do modelo no site está diferente do nome na Meta, ou o modelo ainda não foi aprovado.
- **"(#131030) Recipient phone number not in allowed list"**: o número ainda está em modo de teste. Complete os passos 3 e 4.
- **"Error validating access token"**: token errado ou expirado. Gere outro no passo 5 e troque no Vercel (e faça Redeploy).
- **Nada foi enviado ao meio-dia**: confira em *Vercel → Settings → Cron Jobs* se o agendamento aparece, e se a cobrança automática está ligada no site.
