# Quatro coisas que a Lia deixou de gravar em 27 de agosto

**Para quem mexe na Lia.** Não é pedido de funcionalidade nova: é uma pergunta
sobre uma coisa que mudou e que ninguém registrou.

---

## O que foi medido

Consulta ao banco em 23/09/2026. Quatro destinos que a Lia alimentava **pararam
no mesmo dia, 27/08**, e não voltaram:

| o que ela gravava | ritmo no mês anterior | desde 27/08 | deixou de registrar |
|---|---|---|---|
| `lia_corretor_messages` — conversa dela com o corretor, no plantão | 327/dia | **0** | ~8.800 |
| `lia_lead_facts` — o que ela aprende sobre o lead | 144/dia | **0** | ~3.900 |
| `lia_visitas` | 11/dia | **0** | ~306 |
| `whatsapp_messages` → `metadata.role` e `metadata.lia_source` | — | **0** | 2.017 mensagens sem saber quem falou |

## E o que continuou normal

Isto é o mais importante do diagnóstico:

- **as mensagens de WhatsApp em si** — 2.017 enviadas desde 27/08, todas gravadas;
- **`lia_followups`** — os agendamentos, até hoje;
- **`lead_events`** com tipo `lia.*` — até hoje.

Se fosse credencial, conexão ou permissão, teria parado tudo. **Parou um
subconjunto**, enquanto o resto seguiu — então os quatro provavelmente passam
por um caminho comum: um sub-fluxo, uma função de gravação compartilhada, ou um
nó que foi trocado naquele dia.

---

## As três perguntas

1. **O que subiu no servidor da Lia em 26 ou 27 de agosto?** Histórico de
   deploy, ou a data de modificação dos arquivos do fluxo.
2. **Aqueles quatro destinos ainda existem no fluxo?** Se foram removidos, foi
   decisão de alguém e a resposta é essa — basta dizer, e paramos de procurar.
3. **Há erro no log ao gravar neles?** Se estiver falhando em silêncio, com o
   erro engolido, é o cenário mais provável e o mais simples de consertar.

**Qualquer uma das três respostas encerra o assunto.** Inclusive "foi de
propósito" — o que não dá para deixar é em aberto, porque se for falha são
~13 mil registros por mês que continuam a se perder.

---

## Se for para religar

Nada muda de contrato: os quatro voltam a receber o que recebiam antes de
27/08. Dois pontos que valem lembrar:

**`metadata.role` e `metadata.lia_source`** continuam válidos. E há agora uma
coluna própria, que é o lugar certo daqui para a frente:

```
whatsapp_messages.enviado_por = 'lia'        ← vocês falando com o cliente
whatsapp_messages.enviado_por = 'disparo'    ← envio em massa, campanha, lista
```

O detalhe está em `PROMPT_LIA_ETIQUETA.md`. O banco aceita três valores e mais
nenhum; em mensagem recebida, deixem nulo.

**O que já se perdeu não volta.** As 2.017 mensagens de 27/08 até hoje ficam
como "sem autor" na tela — de propósito, porque marcá-las como Lia agora seria
afirmar autoria que ninguém registrou.

---

## Como confirmar que voltou

Não precisa avisar nem testar nada: assim que os quatro voltarem a receber, a
data do último registro de cada um muda. **Uma consulta de trinta segundos do
lado da Dash responde**, comparando com 27/08.
