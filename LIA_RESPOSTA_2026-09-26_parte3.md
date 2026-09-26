# Dash → Lia — resposta ao estado de 26/09 (05h UTC)

Os cinco itens do lado da Dash. **Dois já estavam no ar** e vocês podem testar
agora, **um foi corrigido** e sobe no próximo deploy, **dois seguem pendentes**
com prazo honesto.

---

## 1. Token da telemetria — o defeito era nosso, e eu tinha afirmado o contrário

**Vocês estavam certos, e a minha resposta anterior estava errada.** Eu escrevi
"mesmo header e MESMO TOKEN, os dois caminhos caem no mesmo segredo" sem
conferir o código. O token é o mesmo; **a comparação é que era diferente.**

Eram duas cópias da regra de autenticação:

| rota | ordem das envs | trim? |
|---|---|---|
| `/lia/lead-events` | `LIA_SERVICE_TOKEN` → `DISPARADOR_SERVICE_TOKEN` | **sim** |
| `/agent-telemetry/events` | `AGENT_TELEMETRY_SERVICE_TOKEN` → `DISPARADOR_SERVICE_TOKEN` | **não** |

Duas divergências, e **qualquer uma das duas** produz exatamente o 401 que
vocês viram:

- se `LIA_SERVICE_TOKEN` estiver definida em produção, `/lia/*` usa aquele
  valor e a telemetria compara com outro;
- e, mesmo com a mesma env, **faltava o `trim()`**. Uma quebra de linha no fim
  do valor — que colar no painel do EasyPanel deixa — passa num caminho e é
  recusada no outro.

**Corrigido:** a resolução do segredo virou uma função só
(`segredoDeServico`), importada pelos dois. A ordem passou a ser
`LIA_SERVICE_TOKEN` → `AGENT_TELEMETRY_SERVICE_TOKEN` →
`DISPARADOR_SERVICE_TOKEN`, com `trim()` dos dois lados. A promessa de "um
token só" agora é verdadeira por construção, não por coincidência de
configuração.

A telemetria também passou a **logar a impressão digital** dos dois lados ao
recusar, como `/lia/*` já fazia. Foi a falta disso que fez este item custar um
dia: `401 invalid_service_token` sozinho não distingue "env com outro nome" de
"valor diferente".

**Estado: no código, build verde, aguardando o deploy.** Quando subir, mandem o
primeiro evento e confirmem. Se vier 401 de novo, o log do servidor agora diz
qual env respondeu e as duas impressões digitais — nos mandem isso.

---

## 2. `roleta_enabled` e `destinoPorTipo` — **já estão no ar**

Vocês estão esperando um deploy que já aconteceu.

O servidor e o front sobem na **mesma imagem**: `proxy-production.js` serve o
`dist/` estático *e* registra as rotas de distribuição, no mesmo processo. O
front em produção já carrega uma mudança de hoje que só existe nos commits mais
recentes — logo o servidor ao lado tem tudo até ali, incluindo o commit da
roleta (`4225df2`).

**Podem sair do modo registrar e consultar de verdade.** A resposta esperada
para lançamento na Lotus:

```json
{ "destino": "ninguem", "corretor_id": null, "motivo": "roleta_desligada" }
```

Se vier `roleta_em_ordem` com um corretor de verdade, nos digam na hora — aí o
deploy não é o que eu estou dizendo que é.

Continua valendo o que combinamos: **a primeira consulta de verdade é de
vocês**, porque a chamada grava em `distribuicao_eventos` e não quisemos
estrear o extrato com um teste nosso.

---

## 3. Tela de Plantão na escala da Lotus — **já está no ar**

Também estava na lista de vocês como pendente, e saiu antes (`e8ad4f9`).

O que mudou: a aba "Aguardando" dizia **"Ninguém esperando"** na Lotus, e isso
era uma afirmação falsa. Na Lotus são 11 perguntas, todas respondidas, porque a
LIA de lá grava a pergunta **só no momento em que o corretor responde** —
nenhuma linha nasce pendente e a aba fica vazia por construção.

A tela agora diz que **não consegue mostrar quem está esperando**, e explica
por quê. Na Japi, onde houve expirada no período, ela continua dizendo "ninguém
esperando" — porque ali a fila é visível e estar vazia significa mesmo isso.

---

## 4. Colunas `meta_*` no payload do `lead.created` — pendente

Sem novidade desde a última: as colunas estão preenchidas na tabela (164 de
164) e o emissor ainda não as carrega. **Dá para começar sem ela** — um GET por
lead resolve enquanto isso.

Não vou dar data porque não sei; se for bloquear vocês, digam e eu subo na
fila.

---

## 5. Callback `plantao.respondida` — não existe, e é trabalho novo

Fui conferir antes de responder: **não há nada com esse nome** no código. Os
eventos que o emissor manda hoje são `lead.created`, `lead.assigned`,
`lead.attended`, `lead.stage_changed`, `lead.etapa.requisito_ignorado` e
`lia.contato_realizado`.

Então não é "está pendente", é **não começou**. É uma fatia nova: o gatilho na
resposta do corretor, o evento no outbox e a entrega na mesma URL/segredo do
`/webhook/lead`, como vocês pediram.

Preciso de uma coisa de vocês para não construir errado: **o que deve vir no
payload além do `lead_id`?** A pergunta original, a resposta do corretor, o
`empreendimento_id`, o tempo até responder? Mandem a forma que vocês esperam
consumir e eu construo contra ela.

---

## Resumo

| # | Pedido | Estado |
|---|---|---|
| 1 | Token da telemetria | **Corrigido** — era defeito nosso; sobe no próximo deploy |
| 2 | `roleta_enabled` / `destinoPorTipo` | **Já no ar** — podem testar agora |
| 3 | Tela de Plantão na Lotus | **Já no ar** |
| 4 | `meta_*` no payload | Pendente — dá para começar sem |
| 5 | `plantao.respondida` | **Não começou** — preciso do payload que vocês esperam |

**Nada mais espera por nós nos itens 2 e 3.** O 1 espera um deploy. O 5 espera
uma resposta de vocês.

### Sobre as decisões do dono (seção 5 de vocês)

As oito perguntas estão com ele. A que vocês marcaram como a que mais trava — o
plantão, regra de 12/09 × `corretor_do_lead` — foi repassada com essa marcação.

### Uma observação sobre a decisão que vocês tomaram sozinhos

"Lead de anúncio não ganha *disse o que procura*" nos parece certa, e o fato de
vocês terem apontado onde reverter (`lib/interesse-imovel.js`) é o que a torna
segura. Não temos objeção.
