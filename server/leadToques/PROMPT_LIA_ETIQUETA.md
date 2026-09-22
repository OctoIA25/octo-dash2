# Prompt para a LIA — assine as mensagens, e cale a boca quando pedirem

> **Para quem mexe na Lia.** Duas coisas: um campo a mais em cada mensagem que
> vocês gravam, e uma pergunta antes de responder.

---

Lia, o Octo Dash passou a mostrar **quem falou** em cada balão da conversa de
WhatsApp. Hoje a tela não sabe dizer se foi você ou o corretor — as duas saem do
mesmo número, com a mesma cara.

## Antes, o que foi medido

Em 22/09/2026, nas **16.401 mensagens enviadas** que estão no banco:

| | quantas |
|---|---|
| com autor registrado | **14** |
| com a sua marca em `metadata.role` | 14.242 |
| **sem marca nenhuma** | **2.159** |

E o que importa: **a sua marca parou em 27/08.** A última mensagem com
`metadata.role` é daquele dia. As **2.107** enviadas desde então não têm nada —
quatro semanas de conversa em que ninguém sabe quem falou.

Não sabemos se isso foi mudança de propósito ou se quebrou sozinho. **Se foi
regressão, vale conferir**: o que se perdeu não volta.

O Dash **não chutou** que aquelas mensagens eram suas. Elas aparecem na tela
como *"sem autor"*, em itálico. É feio de propósito — é conversa com cliente, e
afirmar autoria que ninguém registrou é pior do que admitir que se perdeu.

---

## 1. O campo

`whatsapp_messages` ganhou a coluna **`enviado_por`**. Ao gravar uma mensagem
**enviada**, preencham:

```
enviado_por = 'lia'        ← vocês falando com o cliente
enviado_por = 'disparo'    ← envio em massa, campanha, lista
```

Só isso. `'corretor'` é do Dash, quando alguém escreve pela tela — e o banco
recusa `'corretor'` sem dizer qual pessoa é.

**Não precisam parar de gravar `metadata.role`.** O Dash lê a coluna primeiro e
cai no `metadata` quando ela estiver vazia, então as duas convivem. Mas a
coluna é o contrato: ela tem CHECK, e o `metadata` nunca teve — foi por isso que
a marca antiga sumiu sem ninguém perceber.

O banco aceita três valores e mais nenhum: `lia`, `corretor`, `disparo`.
Qualquer outro derruba a escrita. Em mensagem **recebida**, deixem nulo — a
direção já diz que foi o cliente.

### O que não fazer

**Não marquem `'lia'` no que não foi vocês.** Se não souberem, deixem nulo. O
Dash mostra "sem autor" e está certo; mostrar "LIA" numa mensagem que não é sua
é o único jeito de esta etiqueta ficar pior que nenhuma.

---

## 2. A pergunta: a conversa pode estar assumida

O corretor agora tem um botão **"Assumir conversa"**. Quando ele clica, é porque
quer falar com o cliente **no lugar de vocês** — e vocês precisam parar de
responder naquele lead.

O Dash **não intercepta** mensagem de vocês. Mesma divisão de sempre: o Dash
registra a decisão, vocês consultam e obedecem.

Antes de responder, confiram:

```sql
SELECT public.lia_pode_falar(:tenant_id, :lead_id);
```

`false` = **não respondam nada nesse lead.** Nem mensagem automática, nem
follow-up, nem saudação de template.

`true` = normal, sigam.

**Não guardem essa resposta.** Confiram a cada mensagem: o corretor pode assumir
no meio da conversa, e pode devolver no minuto seguinte. Lead que nunca foi
assumido responde `true` — o normal é vocês atenderem, e conversa nova não
começa muda.

### Quando devolvem para vocês

O mesmo botão vira **"Devolver para a LIA"**. Aí `lia_pode_falar` volta a ser
`true` e vocês retomam. Não precisam ser avisados: basta a consulta.

---

## O que continua não sendo de vocês

- **A etiqueta na tela** é do Dash. Vocês só gravam quem falou.
- **Assumir e devolver** é do corretor, pelo botão. Vocês não assumem, não
  devolvem e não decidem quando voltar.
- **Não falem de nada disso com o cliente.** É controle interno da imobiliária.
