# Pix com baixa automática (Mercado Pago) — passo a passo

Com isso ligado:

- **Perto do vencimento (5 dias antes), o aluno vê no site** o aviso "💳 Sua mensalidade vence…" com o botão **Pagar com Pix** (QR Code + copia e cola).
- **Quando ele paga, o Mercado Pago avisa o site**, que registra o pagamento no Financeiro e passa o vencimento para o mês seguinte. Você não precisa fazer nada.
- No Financeiro, o botão **link do Pix** gera o Pix de qualquer aluno e copia um link de pagamento para você mandar no WhatsApp.
- Se a cobrança automática pelo WhatsApp estiver ligada, a mensagem já vai com esse Pix.
- Todo dia, a rotina das 12h confere os Pix em aberto (caso algum aviso tenha se perdido).

Custo: a taxa do Mercado Pago por Pix recebido (confira em mercadopago.com.br/custos-de-recebimento). Não precisa de CNPJ.

## 1) Conta no Mercado Pago

Use a sua conta de pessoa física (CPF) ou crie uma em mercadopago.com.br. Cadastre uma **chave Pix** na conta (no app: Pix → Minhas chaves).

## 2) Pegar o Access Token

1. Entre em **mercadopago.com.br/developers** com a sua conta.
2. Clique em **Suas integrações** → **Criar aplicação**. Nome: "Mentoria ENEM". Tipo de pagamento: **Pagamentos on-line** / **Checkout Transparente** (ou "CheckoutAPI").
3. Dentro da aplicação, abra **Credenciais de produção** e ative (ele pede o ramo — Educação — e o endereço do site).
4. Copie o **Access Token** (começa com `APP_USR-`). **Não mande para ninguém.**

## 3) Colocar o Access Token no Vercel

1. No Vercel, abra o projeto do site → **Settings** → **Environment Variables**.
2. Crie a variável `MP_ACCESS_TOKEN` e cole o Access Token. Marque **Production**.
3. Vá em **Deployments**, nos três pontinhos do último, clique em **Redeploy**.

## 4) Endereço de notificações (webhook)

1. No painel do Mercado Pago (sua aplicação) → **Webhooks** → **Configurar notificações**.
2. Modo **produção**, URL: `https://SEU-SITE/api/mercadopago` (o endereço certo aparece no site, em Financeiro → Configurações).
3. Evento: **Pagamentos**. Salve.

(O site também informa esse endereço em cada Pix que gera, então mesmo sem este passo o aviso chega. Configurar aqui é uma garantia a mais.)

## 5) Testar

1. No site, em Financeiro → Configurações, deve aparecer "✓ Mercado Pago conectado".
2. Coloque um aluno de teste com mensalidade de R$ 1,00 vencendo hoje, entre com ele e pague o Pix.
3. Em alguns segundos a tela mostra "Pagamento confirmado!" e o Financeiro registra o pagamento.
