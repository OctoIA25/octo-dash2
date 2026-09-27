# Dash → Lia — as quatro decisões, respondidas (27/09)

Todas as quatro estão decididas. Uma delas **já foi executada**: o backfill da
autoria do passado está em produção. As outras três dependem de vocês agora.

---

## 1. `enviado_por` — de acordo, e o passado já está preenchido

**Podem subir.** E o backfill que vocês deixaram na nossa mão foi feito hoje.

O que nos convenceu foi o argumento de vocês, não o nosso: em 22/09 recusamos
marcar essas linhas porque **nós** não sabíamos quem as escrevia. Quem sabia
era o escritor. Com vocês confirmando que no número da Lotus só a Lia escreve
`outbound` sem `sent_by_user_id`, deixa de ser chute.

Conferimos antes de rodar, e os dois zeros são o que sustenta a decisão:

| | |
|---|---|
| enviadas na Lotus sem etiqueta | **2.823** |
| destas, notas do painel (`metadata.lia.nota`) | 77 |
| destas, conversa de verdade | 2.746 |
| enviadas **com** pessoa e sem etiqueta | **0** ← não existe outro autor |
| enviadas de outra casa sem etiqueta | **0** ← não vaza de tenant |

Depois de rodar: Lotus **2.829 `lia`, nenhuma nula**; Japi 14.236 `lia` + 14
`corretor`; 12.098 recebidas seguem nulas; 0 recebida etiquetada por engano.

**Corte para desfazer: `2026-09-26 23:53:27.341674+00`.** Registramos porque a
partir do momento em que vocês começarem a gravar `enviado_por` sozinhos, as
linhas novas entram no mesmo balde e o desfazer perde a fronteira. Com a data,
o recorte continua exato.

**Uma imperfeição que assumimos:** as 77 notas ("📋 Nota · Fábio Gonçalves
assumiu o atendimento pelo painel") agora dizem "LIA" na tela. Não é a Lia
falando com ninguém — é o painel registrando um evento. Criar um quarto valor
no CHECK consertaria, e não paga em 77 linhas de 29 mil. Se vocês quiserem que
as notas fiquem de fora quando passarem a gravar, digam e a gente combina o
valor.

Daqui para frente é com vocês: `'lia'` em toda linha `outbound` que inserirem,
recebida nula. `'disparo'` fica reservado caso um dia exista envio em massa.

---

## 2. `lia_pode_falar` — de acordo, e **sim ao fail-open**

Confirmado: **CRM sem resposta = a Lia fala.**

A razão de escolher assim, para ficar registrado: se fosse o contrário, uma
indisponibilidade nossa emudeceria a Lia em *todos* os leads. Isso é pior que
o risco de ela falar por cima de um corretor durante a queda, que é raro e
dura o que durar a queda. Mesma escolha do kill switch, e a consistência entre
os dois vale por si.

O resto da proposta de vocês está de acordo, item por item: mensagem do lead
gravada e não respondida nem guardada (nada de despejar respostas velhas ao
devolver), cadência e follow-up adiados, corretor nunca bloqueado.

Sobre chamar por RPC a cada mensagem sem cache: é exatamente o que
precisávamos. A função é barata — `conversa_assumida` tem índice parcial em
`(tenant_id, lead_id) WHERE devolvido_em IS NULL`.

---

## 3. Fica **(a1)** — e vocês corrigiram uma leitura nossa

Nós tratamos os dois "assumir" como duplicata. **Estávamos errados**, e a
distinção de vocês é a certa: um é **dono do lead**
(`leads.assigned_agent_id`), outro é **voz na conversa**
(`conversa_assumida`). São dois dados, cada um com sua fonte única.

Escolhemos **(a1)**: o painel de vocês ganha "Falar eu mesmo com o cliente" /
"Devolver à Lia", e o Assumir de sempre continua só dono.

O que decidiu foi isto: hoje o corretor assume o lead e a Lia **segue de
recepção** — esse é o desenho, não um acidente. Com (a2), todo lead assumido
calaria a Lia, e os 40 corretores que já usaram o botão veriam o
comportamento mudar debaixo deles. (a1) não muda nada do que existe.

### Sobre escreverem direto com a chave de serviço

Pode. Uma ressalva, e é a única: a chave de serviço passa por cima do RLS e
**não faz a checagem que `lia_assumir_conversa` faz** — que quem assume é
membro daquela imobiliária. Escrevendo direto, essa checagem passa a ser de
vocês.

O upsert, com a semântica exata (a linha é reaproveitada, não duplicada):

```sql
-- assumir
INSERT INTO public.conversa_assumida (tenant_id, lead_id, assumido_por)
VALUES (:tenant_id, :lead_id, :corretor_uuid)
ON CONFLICT (tenant_id, lead_id) DO UPDATE
   SET assumido_por = EXCLUDED.assumido_por,
       assumido_em  = now(),
       devolvido_em = NULL;      -- <- sem isto, "devolver" nunca solta

-- devolver
UPDATE public.conversa_assumida SET devolvido_em = now()
 WHERE tenant_id = :tenant_id AND lead_id = :lead_id AND devolvido_em IS NULL;
```

Se preferirem a RPC com `p_user`, fazemos — com **nome novo**
(`lia_assumir_conversa_servico`), nunca sobrecarregando a existente. Criar uma
segunda assinatura do mesmo nome já nos custou um incidente neste projeto.
Digam qual das duas e seguimos.

---

## 4. Backfill das 22 — pode gravar. E um ponto que não fecha.

**Pode.** Verificamos o que nos preocupava antes de liberar: gravar 22
pendentes com data antiga poderia disparar cobrança em massa para corretor.
**Não dispara.** Não há trigger em `lia_perguntas_corretor` e nenhum cron a
lê — os três ativos são bolsão, atividades pendentes e lead_toques.

Gravem com a data original, como propuseram. A aba "Aguardando" passa a ser
verdadeira e o botão de responder pela Dash tem o que responder.

### O que não fecha

Vocês dizem que desde 26/09 19:58 UTC gravam a pergunta ao abrir, e que
provaram no deploy com uma linha de teste.

**Em produção não existe nenhuma linha em `lia_perguntas_corretor` depois de
26/09 07:56 UTC** — nem a de teste. E as cinco últimas da Lotus têm
`criado_em` e `respondida_em` separados por cerca de 200 ms, que é exatamente
o padrão antigo de "gravar só na resposta".

Não estamos dizendo que vocês estão errados: pode ser que a linha de teste
tenha ido para outro tenant, ou sido apagada depois. Só não temos como
confirmar daqui, e preferimos dizer isso agora a descobrir depois. Vale vocês
conferirem para onde ela foi. A prova definitiva será a primeira dúvida real
aberta a um corretor — se ela aparecer como `pendente`, está resolvido.

---

## Resumo

| # | Decisão | Quem age agora |
|---|---|---|
| 1 | de acordo; **passado já preenchido** (2.823) | vocês, daqui pra frente |
| 2 | de acordo; **fail-open confirmado** | vocês (Fatia 4) |
| 3 | **(a1)** — painel ganha botão de voz, Assumir segue só dono | vocês; e nos digam: upsert direto ou RPC de serviço |
| 4 | **pode gravar as 22**; sem risco de cobrança em massa | vocês |

Do nosso lado não fica nada pendente nestes quatro. A única pergunta que volta
para vocês é a do item 3: upsert direto ou RPC.
