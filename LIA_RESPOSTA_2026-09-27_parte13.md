# Dash → Lia — 27/09: a etiqueta subiu, e três coisas dependem de vocês

Aplicamos em produção hoje a fatia **F.1**. Ela cria duas capacidades que só
funcionam com vocês do outro lado. E, conferindo para subir, achamos um ponto
cego no plantão que também é de vocês.

---

## O que existe agora no banco

Conferido em produção depois de aplicar:

```
whatsapp_messages.enviado_por        coluna nova, texto, nula por padrão
public.lia_pode_falar(uuid, uuid)    -> boolean
public.lia_assumir_conversa(...)     -> jsonb   (é do corretor, não de vocês)
public.conversa_assumida             tabela de estado
```

`enviado_por` já aparece no PostgREST — podem escrever nela hoje.

---

## 1. Assinem o que vocês mandam

### O que medimos, separando por casa

| Lotus — mensagens **enviadas** | |
|---|---|
| sem marca de autor | **2.823** |
| com marca (`metadata.role`) | **6** |

A marca nunca existiu de fato na Lotus. As 14.236 marcadas que apareciam na
contagem geral são da **Imobiliária Japi**, desligada em 27/08.

> Correção de um número que mandamos antes: escrevemos "24.425 mensagens
> marcadas eram da Japi". 24.435 é o total da Japi nas duas direções; marcadas
> mesmo são 14.236. E a leitura original — "a LIA parou de marcar em 27/08" —
> também estava errada: somamos duas casas num sistema multi-tenant. Não houve
> regressão nenhuma.

### O pedido

Ao gravar uma mensagem **enviada**, preencham:

```
enviado_por = 'lia'        ← vocês falando com o cliente ou com o corretor
enviado_por = 'disparo'    ← envio em massa, campanha, lista
```

`'corretor'` é da Dash, e o banco recusa `'corretor'` sem dizer qual pessoa é.
Em mensagem **recebida**, deixem nulo. O banco aceita esses três valores e mais
nenhum — qualquer outro derruba a escrita.

Não precisam parar de gravar `metadata.role`: a Dash lê a coluna primeiro e cai
no `metadata` quando ela está vazia. Mas a coluna é o contrato — ela tem CHECK,
e o `metadata` nunca teve. Foi por isso que a marca antiga sumiu sem ninguém
perceber.

**Se não souberem quem falou, deixem nulo.** A tela mostra "sem autor", e está
certo. Marcar `'lia'` no que não foi vocês é o único jeito de esta etiqueta
ficar pior que nenhuma.

Enquanto isso não acontece, a conversa da Lotus vai aparecer com "sem autor"
em 2.823 de 2.829 balões. Não chutamos autoria em conversa com cliente.

---

## 2. Perguntem antes de falar

O corretor tem um botão **"Assumir conversa"**. Quando ele clica, quer falar
com o cliente **no lugar de vocês**.

A Dash **não intercepta** mensagem de vocês — mesma divisão do
`corretor_bloqueado`: a Dash registra, vocês consultam e obedecem.

```sql
SELECT public.lia_pode_falar(:tenant_id, :lead_id);
```

`false` = **não respondam nada nesse lead.** Nem automática, nem follow-up, nem
saudação de template. `true` = sigam normal.

**Não guardem a resposta em cache.** Confiram a cada mensagem: o corretor pode
assumir no meio da conversa e devolver no minuto seguinte. Lead sem linha
nenhuma responde `true` — conversa nova não começa muda.

---

## 3. O "assumir" de vocês e o nosso precisam ser o mesmo

Aqui está o problema que achamos, e é o mais importante deste documento.

O painel de vocês **já tem** essas ações, gravadas como nota na conversa desde
23/09:

| ação | quantas | período |
|---|---|---|
| `assumir` | 40 | 23/09 → 26/09 |
| `transferir` | 25 | 24/09 |
| `responder` | 15 | 24/09 → 25/09 |
| `visita` | 1 | 25/09 |

São notas, não estado: não há tabela dizendo *quais conversas estão assumidas
agora*. O `conversa_assumida` é a primeira. Só que agora existem **dois botões
de assumir** — o do painel de vocês e o da Dash — e eles não se falam.

Regra da casa: **uma fonte por dado.** Então precisamos decidir, e a escolha é
de vocês:

**(a)** quando alguém assumir pelo painel de vocês, vocês escrevem no
`conversa_assumida` (ou chamam `lia_assumir_conversa`). Ela vira a fonte única,
os dois botões concordam, e a Dash mostra "Conversa assumida" venha de onde
vier;

**(b)** o botão da Dash é retirado e fica só o de vocês — mas aí a Dash precisa
de alguma consulta para saber quem está assumido, porque hoje ela não tem.

Preferimos **(a)**. Digam qual, e o que precisam de nós para isso.

---

## 4. O plantão da Lotus não tem como ser testado — e isso é do lado de vocês

Ficamos devendo o teste do `plantao.respondida`. Fomos conferir por que ele
nunca dispara e o motivo não é nosso:

| casa | pendente | respondida | expirada |
|---|---|---|---|
| Lotus | **0** | 91 | 0 |
| Japi (desligada) | 4 | 1.498 | 38 |

Na Lotus, **nenhuma linha nasce pendente**. A LIA de lá grava a pergunta em
`lia_perguntas_corretor` só **no momento em que o corretor responde**. Então:

- a aba "Aguardando" é vazia por construção, não porque ninguém espera;
- o botão "Responder pela Dash" nunca tem o que responder;
- e o `plantao.respondida`, que dispara quando alguém responde **pela tela**,
  não tem como ser exercitado.

**O pedido:** gravem a linha **quando fizerem a pergunta** (`status =
'pendente'`), e atualizem quando a resposta chegar pelo WhatsApp. É a mesma
linha, só nasce mais cedo. Com isso a fila passa a existir, o corretor pode
responder pela Dash, e o callback que vocês pediram passa a ter como ser
testado.

Enquanto isso não muda, a tela continua dizendo que **não consegue mostrar
quem está esperando** — e explicando o porquê — em vez de afirmar "ninguém
esperando", que seria falso.

---

## Resumo

| # | O que precisamos | De quem |
|---|---|---|
| 1 | gravar `enviado_por` no que vocês enviam | vocês |
| 2 | consultar `lia_pode_falar()` antes de responder | vocês |
| 3 | decidir (a) ou (b) no "assumir" duplicado | vocês decidem, nós ajustamos |
| 4 | gravar a pergunta do plantão **quando ela é feita** | vocês |

Os itens 1 e 2 podem começar hoje — o banco já está pronto dos dois lados.

### O que não é de vocês

- **A etiqueta na tela** é da Dash. Vocês só gravam quem falou.
- **Assumir e devolver** é do corretor, pelo botão.
- **Nada disso se fala com o cliente.** É controle interno da imobiliária.
