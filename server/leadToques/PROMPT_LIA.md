# LIA — Cadência do lead no Octo Dash

> Instruções para a LIA (n8n). Contrato com o Octo Dash a partir de 16/09/2026.

## O que mudou no Octo Dash

O modal do lead no Dash agora tem **10 quadrados de cadência**. Cada quadrado é um **toque** com o cliente, em ordem de data:

- **Toques do corretor** ficam em `public.lead_toques`: canal (`whatsapp`, `ligacao`, `email`, `presencial`), resultado (`respondeu`, `nao_respondeu`, `numero_errado`, `nao_contatar`), quem registrou, quando e o **próximo toque** que o corretor marcou (data e hora, ou "sem próximo").
- **Seus envios** (`lia_followups`) também ocupam quadrados, mas **só quando a mensagem de fato saiu**.
- **Na hora do próximo toque**, o próprio Dash avisa o corretor (sininho + janela na tela). **Você não precisa avisar.**

## O que você precisa fazer

Ao reportar cadências em `POST /api/v1/lia/cadencias`:

1. **Quando a mensagem sair,** reporte `status: "sent"` **com** `sent_at` (hora real do envio). Agendada, cancelada ou expirada não vira quadrado; envio sem essa confirmação não aparece.
2. **Quando o cliente pedir para não ser mais contatado,** reporte `outcome: "opt_out"`. Sem isso o quadrado aparece como "não respondeu".

## O que você NÃO deve fazer

- **Não bloqueie corretor por cadência.** Toque atrasado ou não registrado não gera bloqueio nem WhatsApp de cobrança.
- **Não escreva em `lead_toques`.** Quem registra toque é o corretor, no Dash.

> A regra de bloqueio da Central de Leads (24h para agendar atividade com lead novo) está em discussão e **não vale ainda**. Ela terá instruções próprias quando for aprovada.
