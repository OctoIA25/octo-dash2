# A agenda — "me chama amanhã às 16h"

**Para quem mexe na Lia (servidor da Hostinger).** Quando o lead pede para ser
chamado numa hora, isso vira um retorno agendado que não se perde.

**Nada do que vocês fazem hoje muda.** Não há tabela nova: o retorno agendado é
uma linha de `lia_followups`, a mesma que vocês já escrevem pela rota
`POST /api/v1/lia/cadencias`. Criar uma segunda tabela daria dois disparadores,
e o cliente receberia a mensagem duas vezes.

---

## 1. A regra que não pode ser esquecida

Uma linha com **`pedido_por: "lead"`** NÃO pode ser cancelada quando o lead volta
a falar.

Hoje o cancelamento por `lead_returned` responde por **2.361 dos 2.421
cancelamentos**, e está certo para a cadência: a Lia ia cutucar quem sumiu, e ele
apareceu. Mas o retorno agendado é o contrário — **o pedido É o lead falando**.
Cancelá-lo por isso apagaria a ligação que ele acabou de pedir, e ninguém
descobriria: some em silêncio.

```
cancelar por lead_returned  →  somente quando pedido_por != 'lead'
```

Os outros cancelamentos continuam valendo para todos: o corretor assumiu, a Lia
encerrou, o gestor cancelou na Dash (`cancelled_reason = 'cancelado_na_dash'`).

---

## 2. Registrar o pedido

Mesma rota de sempre, com dois campos a mais:

```
POST /api/v1/lia/cadencias
{
  "tenant_id": "...",
  "lead_id": "...",
  "idempotency_key": "lia:retorno:<lead>:<quando>",
  "status": "pending",
  "scheduled_at": "2026-09-23T19:00:00Z",
  "motivo": "cliente pediu: me chama amanhã às 16h",
  "pedido_por": "lead",
  "channel": "whatsapp"
}
```

| campo | o quê |
|---|---|
| `pedido_por` | `lead`, `lia` ou `corretor`. **Ausente vale `lia`** — por isso tudo o que vocês mandam hoje continua igual |
| `erro` | por que o disparo falhou. Campo próprio, separado de `cancelled_reason` |

`pedido_por: "lead"` **exige** `scheduled_at`. Sem hora não é agendamento: é um
pedido que ninguém vai cumprir, e apareceria na tela como linha muda. A rota
recusa com `422 scheduled_at: required_when_pedido_por_lead`.

---

## 3. A resposta diz a hora de verdade

A imobiliária configura um **horário de não incomodar** (padrão: antes das 9h e
depois das 20h). Quando o lead pede fora dele, **a Dash empurra** para o primeiro
horário permitido e devolve qual é:

```json
{ "ok": true, "id": "...", "agendado_para": "2026-09-23T12:00:00Z", "ajustado": true }
```

- `ajustado: true` → **avisem o lead**: *"consigo te chamar às 9h, pode ser?"*.
  Sem isso vocês confirmam "te chamo às 3h" e a mensagem sai às 9h.
- `ajustado: false` → a hora pedida valeu; confirmem como ela veio.

Vocês não precisam ler a configuração nem fazer essa conta — ela é a mesma da
janela de atendimento e mora num lugar só.

---

## 4. Na hora de disparar

O workflow que já roda continua igual: pega `status = 'pending'` com
`scheduled_at <= agora`, envia, marca `sent` com `sent_at`, ou `expired` com o
motivo — agora em **`erro`**.

Duas diferenças para o retorno pedido pelo lead:

**1. Se o lead já está com um corretor, a Lia NÃO manda a mensagem.**
Decidido pelo chefe em 21/09/2026. Avisem o corretor que o cliente pediu retorno
agora, e deixem ele falar. O cliente não deve receber duas vozes diferentes na
mesma conversa. A tela já mostra isso ao gestor: *"Fulano é quem fala — a LIA só
avisa"*.

**2. Digam por que não saiu.** Das 84 linhas que não saíram, **48 não registram
motivo nenhum** — na tela elas aparecem como *"não saiu, e o disparador não disse
por quê"*, que é o melhor que dá para dizer com o dado que existe. Preencher
`erro` transforma isso em informação.

---

## 5. O que o gestor vê

**LIA › Agenda**, com cinco abas: Hoje · A cumprir · Pedidos pelo lead ·
Atrasados · Não saíram. E no card do lead, o corretor vê *"Retorno pedido pelo
cliente: amanhã 16h"*, podendo remarcar ou cancelar.

Quando o corretor marca um retorno à mão, a linha nasce com
`pedido_por: "corretor"` e `tag: "retorno_manual"` — é dela que vocês devem
partir se forem disparar esses também.

---

## Uma coisa que importa

**Remarcar é cancelar e criar.** Deixar a linha antiga pendente ao lado da nova
manda duas mensagens ao mesmo cliente com poucos minutos de diferença. A Dash já
faz assim (`cancelled_reason = 'rescheduled'`); façam igual do lado de vocês.
