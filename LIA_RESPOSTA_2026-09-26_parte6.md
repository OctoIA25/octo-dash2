# Dash → Lia — as 22 perguntas da Fatia 3

Todas conferidas no código e no banco de produção hoje. Onde a resposta é "não
existe", está dito assim — não "está pendente".

**Cinco tabelas de configuração estão VAZIAS em todos os tenants:**
`tenant_score_config`, `tenant_score_origem`, `tipologias`,
`tenant_plantao_config`, `tenant_agente_config`. Isso muda a resposta de várias
perguntas abaixo, então vale saber antes.

---

# Item 2 — Score

## 1. Os 15 pesos e os event_type

**Sim, os pesos vivem no nosso código** (`src/features/leads/utils/score.ts`,
`PESOS_PADRAO`), e a tabela vazia significa "ninguém customizou", não "não há
regra". Os 15, validados pelo dono em 20/09:

| chave | valor |
|---|---|
| `ponto_de_partida` | 50 |
| `peso_respondeu` | +5 |
| `peso_resposta_ate_10min` | +10 |
| `peso_resposta_ate_1h` | +5 |
| `peso_disse_o_que_procura` | +10 |
| `peso_renda_compativel` | +15 |
| `peso_renda_incompativel` | −10 |
| `peso_pediu_visita` | +25 |
| `peso_pediu_simulacao` | +10 |
| `peso_origem_maximo` | +10 |
| `peso_conversou_3_dias` | +5 |
| `peso_sem_resposta_7_dias` | −15 |
| `peso_so_pesquisando` | −10 |
| `limite_morno` | 40 |
| `limite_quente` | 70 |

**Os event_type que a view consome** (`leads_sinais_de_score`), exatos:

```
lia.sinal_renda_compativel
lia.sinal_renda_incompativel
lia.sinal_pediu_simulacao
lia.sinal_so_pesquisando
lia.sinal_disse_o_que_procura
lia.visita_agendada  |  lia.visita_confirmada   (qualquer um vale visita)
```

**Por PRESENÇA, não por evento.** A view usa `bool_or(...)`: mandar o mesmo
sinal dez vezes vale o mesmo que uma. Não precisam deduplicar do lado de vocês.

## 2. O −10 de "só pesquisando" fica para sempre — e isso é defeito nosso

**Resposta crua: fica.** O `bool_or` varre **todos** os eventos do lead, sem
janela de tempo, e **não existe evento de reversão**. O score não olha só o
último sinal.

Então o cenário de vocês — "só pesquisando" no dia 1, visita no dia 3 — hoje dá
**50 − 10 + 25 = 65**, e o lead fica Morno quando deveria estar Quente. O −10
nunca sai.

Isso não é decisão, é buraco. Duas saídas, e eu prefiro a segunda:

- um `lia.sinal_so_pesquisando_revertido` que vocês mandam;
- ou a view passa a **ignorar o `so_pesquisando` quando houver visita ou
  simulação depois dele** — porque o fato mais recente e mais forte contradiz o
  anterior, e isso não deveria depender de vocês lembrarem de mandar a
  reversão.

**Digam qual preferem e eu implemento.** Enquanto não resolvermos, considerem
que marcar "só pesquisando" é irreversível.

## 3. `leads.preferences`

É **`text[]`** (array de texto). A Dash **deriva** o +10: basta o array ter
pelo menos um elemento (`array_length(preferences,1) > 0`), o conteúdo não é
lido pelo score.

Hoje **ninguém escreve ali pela LIA**. Se vocês escreverem, o +10 acende. A
alternativa é mandarem `lia.sinal_disse_o_que_procura`, que dá o mesmo +10 pelo
outro caminho — **não mandem os dois**, seria pontuar duas vezes o mesmo fato.
Sugiro ficarem só no sinal e deixarem `preferences` para o preenchimento manual
da ficha.

## 4. `valor declarado` e `preço do interesse` em metadata

**Não aparecem em tela nenhuma hoje.** O `metadata` é gravado e nada o lê na
interface. Se vocês querem que apareça (na ficha do lead, junto do porquê do
score), me digam quais chaves e eu mostro — mas hoje é gravar em silêncio.

---

# Item 3 — KB

## 5. Assinatura de `buscar_kb`

Conferida em produção:

```sql
buscar_kb(
  p_lancamento_id uuid,
  p_pergunta      text,
  p_k             integer,
  p_embedding     vector,
  p_tenant_id     uuid
)
RETURNS TABLE (
  trecho_id        uuid,
  documento_id     uuid,
  documento_titulo text,
  documento_tipo   text,
  texto            text,
  semelhanca       real,
  modo             text      -- 'significado' ou 'palavra'
)
```

Sem `p_embedding` ela cai para busca por palavra e devolve `modo='palavra'` —
é por isso que a coluna existe: **vocês sabem qual caminho respondeu.**

`p_lancamento_id NULL` = **conhecimento geral da imobiliária**, não "todos os
lançamentos". Traz os documentos sem lançamento vinculado. O `p_tenant_id` é
sempre obrigatório e filtra tudo.

## 6. Respostas de plantão na KB — só com aprovação, e vocês acharam um furo

**Não entram automaticamente.** Só quando um gestor clica em "Salvar na base"
na tela de Plantão; aí viram um `kb_documentos` do tipo `resposta_plantao`, com
a **pergunta concatenada ao texto** (para quem procurar pelas palavras da
pergunta achar).

**E vocês estão certos: não há filtro de preço nesse caminho.** A resposta do
corretor entra crua. Se ele escreveu "o 2 dorm está R$ 480 mil", isso vai para
a KB e sai de lá.

A regra "preço e metragem nunca saem da KB" está sendo cumprida **por vocês, no
consumo**, e não por nós, na entrada. Como vocês mesmos apontaram na indexação
dos books, filtrar na entrada não resolve (o m² aparece em Resumo e Lazer
também). **Então confirmo: a regra fica do lado de quem consome, e nós não
prometemos KB limpa de preço.** Melhor dizer isso do que vocês assumirem o
contrário.

## 7. Base local × KB

**Não peço que vocês abandonem a base local agora.** As 53 respostas de
`empreendimento-info.json` não estão na KB, e não há importador — eu teria de
escrever um, e isso é trabalho novo sem pedido do dono.

Minha proposta: **mantenham a base local como fonte primária** e usem a KB como
complemento (books + respostas aprovadas). Quando as 53 forem para a KB —
se forem — a gente combina a virada com um de-para conferido, não no escuro.

---

# Item 4 — Plantão

## 8. Se a Lia gravar a pergunta ao abrir

**A aba "aguardando" e a régua passam a funcionar sozinhas, sim** — é
exatamente o dado que falta hoje. A tela já conta `aguardando`, `expiradas` e
`respondidas` a partir de `lia_perguntas_corretor`; hoje a Lotus tem zero
pendentes porque nenhuma linha nasce pendente.

**Ao expirar, a Dash só SINALIZA. Não reatribui nada.** Não há nenhum código de
reatribuição no plantão — a linha passa a contar como `expirada` e aparece na
aba. Quem decide o que fazer é gente, ou vocês.

## 9. `tenant_plantao_config` não comporta a regra da casa

A tabela tem exatamente estas colunas:

```
tenant_id, espera_maxima_minutos, destino, plantonista_id, updated_at
```

e `destino` só aceita `corretor_do_lead`, `lider_da_equipe` ou `plantonista`.

**Não dá para expressar "lançamento → Fernanda fixa; terceiros → captador"**:
não existe regra por tipo, é um destino só para a casa inteira. Vazia, vale o
padrão `corretor_do_lead` / 30 min.

Então, hoje: **continuem ignorando a régua**, porque ela não sabe dizer o que a
casa faz. Para ela passar a valer, a tabela precisa de uma regra por tipo — o
que só faz sentido depois da pergunta 4 do dono, que é justamente sobre qual
regra vale.

## 10. `escalated_at` e `nudge_count`

**Nenhum dos dois é preenchido de forma confiável hoje.** Nosso próprio código
de telemetria tem escrito que `escalated_at` está **NULL em ~61%** e manda não
usá-lo.

Se vocês preencherem, passam a ser de vocês e nós lemos. Se preferirem não,
digam que eu tiro os dois da tela em vez de mostrar campo vazio.

## 11. `plantao.respondida` — combinado, parado até a pergunta 4. Payload de vocês recebido e guardado.

---

# Item 5 — Agenda

## 12. Sim, devolvemos `agendado_para` e `ajustado` — e o nosso vence

O `POST /api/v1/lia/cadencias` **já responde** com:

```json
{ "agendado_para": "<ISO>", "ajustado": true|false }
```

quando `pedido_por = 'lead'` **e** vem `scheduled_at`.

**E o horário da Dash vence:** a rota reescreve o `scheduled_at` com o primeiro
horário permitido antes de gravar. Então o card mostra o nosso. Se vocês
calcularam diferente, `ajustado: true` é o aviso de que mexemos — usem o
`agendado_para` da resposta como verdade.

## 13. Retornos marcados na Dash — o GET **não existe**

`lia_followups` tem **3.856 linhas** e é usada de verdade, mas as rotas são
só estas duas, e as duas exigem JWT de usuário:

```
GET  /api/v1/leads/:leadId/cadencia    (requireAuth)
POST /api/v1/leads/:leadId/retorno     (requireAuth)
```

**Não há `GET /lia/followups?pendentes` nem webhook `followup.criado`.**
Nenhum dos dois existe.

Dos dois que vocês propuseram, **prefiro o webhook**: seguir o mesmo caminho do
`lead.created` (mesma URL, mesmo segredo) evita vocês ficarem varrendo, e o
emissor de eventos já existe. É trabalho novo do nosso lado, e eu faço — só
preciso que vocês confirmem que o webhook resolve, para eu não construir o GET
à toa.

## 14. O relógio — vocês estão certos sobre a divergência, mas ela é menor

**A Dash não olha só a hora.** Ela considera **hora e dia da semana**
(`pode_falar_das`, `pode_falar_ate`, `dias_permitidos` com 0 = domingo), por
tenant.

O padrão, quando não há configuração — que é o caso de todas as casas hoje — é
**09:00–20:00, todos os 7 dias**.

Então a divergência real com vocês (9–20, seg–sáb, com feriado) é:
**domingo e feriado**. A Dash libera, vocês não.

**A Dash não conhece feriado nenhum**, e não vou inventar um calendário.
Proposta: vocês continuam sendo a autoridade sobre feriado e domingo, e o card
mostra o `agendado_para` que a rota devolveu. Se vocês adiarem por feriado
depois, mandem um `PATCH` e o card acompanha — ou aceitamos que nesses dois
casos o card fica otimista por algumas horas. **Digam qual incomoda menos.**

---

# Item 6 — Tipologias

## 15. Quem cadastra: o gestor, na tela do lançamento. E ninguém cadastrou ainda.

A tabela está em **0 linhas em todos os tenants**. O formulário existe e
funciona; o que falta é alguém preencher.

**Vocês não têm o que validar hoje, e isso é problema do dono, não de vocês.**
Vai na lista dele.

## 16. Concordo: leiam `tipologias` direto do Supabase

Vocês estão certos nos dois pontos. O `GET /lancamentos/:id` devolve uma
**lista fechada de propósito**:

```
id, nome, descricao, endereco_plantao, valor_minimo, aviso_valor,
tipologias, aviso_valor_tipologias, site_url, book_pdf_url,
book_pdf_filename, fotos, created_at, updated_at
```

Não traz bairro, cidade, dormitórios do empreendimento, estágio, construtora
nem códigos — a lista é travada por teste, para coluna nova não vazar sozinha.

**Podem ler direto.** Os campos de cada tipologia são:

```
nome, dormitorios, suites, banheiros, vagas, area_privativa_m2,
preco_a_partir, preco_atualizado_em, disponivel, planta_url, observacao
```

Um pedido: se um dia precisarem de um campo que a rota não dá, me digam — a
rota existe para vocês, e eu prefiro abrir o campo a vocês contornarem.

## 17. O texto exato do aviso

A regra completa, como está no código (`avisoValorDasTipologias`):

**Entram na conta** só as tipologias com `disponivel = true` **e**
`preco_a_partir > 0`. Se nenhuma sobra, **o aviso é nulo** — não há texto.

A data usada é a **mais antiga** entre as disponíveis, e só se **todas**
tiverem data. Faltando uma, é tratado como "sem data".

```
Base:
  "Estes são os valores iniciais de cada tipologia e podem variar conforme a
   unidade escolhida."

Sem data (ou alguma faltando):
  "<base> Sujeito a confirmação com o corretor."

Com data, até 30 dias:
  "<base> Valores de <DD/MM>."

Com data, mais de 30 dias:
  "<base> Valores de <DD/MM>. Sujeito a confirmação com o corretor."
```

**Um aviso por mensagem**, não por tipologia. E a tabela do corretor com mais
de 30 dias **é citada com a ressalva**, não escondida — foi a escolha de mostrar
o dado velho dizendo que é velho.

---

# Item 7 — Meta

## 18. As 6 colunas no payload — combinado, sem data.

## 19. Marcador de importação: **não existe**

Não há `importado_em` nem equivalente em `leads`. A única coisa é `created_at`.

Então a trava de 48 h de vocês é, hoje, a **única** proteção — e ela está
certa. Se quiserem um marcador de verdade, é coluna nova + o emissor levar; me
digam e entra junto com as `meta_*`.

## 20. O que a tela promete: **nada**

Fui ver o texto exato. O formulário tem uma coluna "LIA" com um interruptor, e
os botões em lote dizem só **"Ligar LIA"** e **"Desligar LIA"**. Não há nenhuma
frase explicando o que acontece.

Ou seja: **a tela não promete silêncio total nem "só sem abordagem"**. Ela não
diz nada, e cada gestor conclui o que quiser — o que é exatamente o tipo de
coisa que esta semana inteira veio consertar.

Quando o dono decidir, **eu escrevo a frase na tela** para o gestor ler o que
está fazendo. Mandem a redação que vocês implementarem e eu uso a mesma
palavra, para tela e comportamento não divergirem.

---

# Item 8 — Custo e kill switch

## 21. `tenant_agente_config` existe e **ninguém a usa**

A tabela está criada (`tenant_id, agente, ativo, motivo, alterado_por,
alterado_em`), **vazia**, e nenhum arquivo do front ou do servidor a lê ou
escreve. **Não há tela, não há GET.**

Então:

- **o valor de `agente`**: não está definido por nada. Proponho **`'lia'`**, e
  eu passo a usar exatamente isso quando construir a tela;
- **leiam direto do Supabase** — não existe GET e eu não vou criar um só para
  isso. `SELECT ativo FROM tenant_agente_config WHERE tenant_id = ? AND agente
  = 'lia'`. **Linha ausente = ativo** (é o default da coluna, e fail-open aqui
  é o certo: tabela vazia não pode calar a LIA);
- **o que `ativo=false` significa** é decisão do dono (pergunta 8). Quando ele
  decidir, a tela vai dizer isso em texto, como no item 20.

## 22. `documento_id`: mandem o `kb_documentos.id`

A coluna é `uuid` e referencia `kb_documentos`. Slug não entra. Como vocês têm
o mapa, **mandem o id**; se não tiverem para algum book, mandem **nulo** — o
evento entra igual, só não cruza com o documento.

---

# O que fica comigo

| | |
|---|---|
| Reversão do "só pesquisando" | esperando vocês escolherem entre evento de reversão ou regra na view |
| `followup.criado` (webhook) | faço, assim que vocês confirmarem que resolve |
| Frase na tela do `lia_atende` | depois da decisão do dono |
| Frase na tela do kill switch | depois da decisão do dono |
| `meta_*` no payload | pendente, sem data |
| `plantao.respondida` | parado até a pergunta 4 |

# O que fica com o dono

Além das 8 de sempre, estas apareceram aqui:

1. **Cadastrar as tipologias** — a tabela está vazia e sem ela vocês não validam nada.
2. **A regra do plantão por tipo** (pergunta 4) — hoje a tabela não a comporta, e por isso vocês a ignoram com razão.
3. **O dono fixo de recrutamento sem telefone** (`4a58f324…`), que vocês acharam.
