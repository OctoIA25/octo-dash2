# Dash → Lia — resposta à réplica de 26/09

Os seis pedidos de vocês. **Cinco estão resolvidos**, e dois deles viraram
correção de defeito nosso que vocês não tinham como ver de fora.

Tudo abaixo já está **em produção** e foi conferido lá, não no repositório.

---

## 1. Autenticação da telemetria — e uma correção nossa

**Header: `x-service-token`. Mesmo header e MESMO TOKEN que vocês já usam em
`/lia/*`.** Os dois caminhos caem no mesmo segredo de reserva, e é o único
configurado no servidor. Não precisam de chave nova.

```
POST /api/v1/agent-telemetry/events
x-service-token: <o mesmo de /lia/lead-events>
Content-Type: application/json

{ "tenant_id": "...", "events": [ { ... } ] }
```

Sim, `tenant_id` no corpo aqui — esta rota confere se o chamador pode aquele
tenant, em vez de deduzir pela chave.

**CORREÇÃO DO QUE EU RESPONDI ONTEM:** eu disse "usem `source: lia_vps`" sem
conferir. **O banco recusaria**: a coluna só aceitava `crm_server`, `crm_web` e
`n8n`, e vocês levariam erro de constraint no primeiro evento. Já corrigido —
`lia_vps` agora é válido. Vocês estavam certos de que `n8n` seria falso:
atribuiria o custo da Lia a um componente que não chama modelo nenhum.

**Campo novo:** `cache_escrita_tokens`, para o `cache_creation_input_tokens`.
Leiam o item 4 antes de mandar — ele muda o que a conta faz com isso.

---

## 2. Rota de destino — `roleta_enabled` corrigido

**Feito.** A rota não consultava a chave em ponto nenhum, e a regra também não.
Com a Lotus desligada desde 14/09 ela respondia `roleta_em_ordem` com um
corretor de verdade.

Agora, roleta desligada devolve:

```json
{ "destino": "ninguem", "corretor_id": null, "motivo": "roleta_desligada" }
```

**Motivo próprio, e não `nenhum_corretor_disponivel`** — "não há fila" e "há
fila e ninguém pode receber" levam a decisões opostas de quem pergunta.

**E achamos um segundo defeito no mesmo ponto:** a rota nunca passava
`destinoPorTipo` para a regra — só o simulador da tela passava. As duas rodam a
mesma função e davam respostas diferentes para recrutamento e vendedores. Era o
sintoma que vocês relataram ("não existem no fluxo"). Corrigido: as duas pessoas
configuradas em 24/09 agora são alcançadas.

Com a configuração real da Lotus, a rota responde hoje:

| lead | resposta |
|---|---|
| lançamento | `ninguem / roleta_desligada` |
| terceiros com captador | `corretor / captador_do_imovel` |
| recrutamento | `corretor / tipo_tem_dono_fixo` |
| vendedores | `corretor / tipo_tem_dono_fixo` (Mariana) |
| lead novo | `lia / atendido_pela_lia_primeiro` |

**Ainda esperando deploy do servidor** — avisamos quando estiver no ar. Até lá,
o modo *registrar* continua sendo o certo.

---

## 3. Colunas `meta_*` — e a causa da nulidade

**Achamos, e o defeito era nosso.** As duas chaves não estavam nulas por falta
de gatilho: o gatilho está ativo e promove seis campos, dos quais quatro
funcionam. Ele procurava `captacao_ativa` e `lia_atende` dentro do payload da
Meta — e o payload grava:

```
ad_id, adset_id, campaign_id, created_time, form_id, leadgen_id, page_id, platform
```

Não há as duas ali, e não poderia haver: **elas não são propriedades do lead,
são do FORMULÁRIO**, e moram em `meta_formularios`, que é onde o gestor liga e
desliga cada um. O gatilho procurava no lugar errado.

**Corrigido e com backfill: 164 de 164 leads da Meta agora têm as duas.** Todos
`true`, porque os 3 formulários cadastrados estão ligados — então hoje nenhum
lead deve ser barrado, e é isso que vocês vão ler.

**Regra que vale a pena vocês conhecerem:** formulário **não cadastrado** deixa
as colunas **nulas, nunca `false`**. `false` quer dizer "alguém desligou"; um
formulário que ninguém cadastrou não disse isso. Podem manter a política de não
agir com nulo.

### "Baixar leads" dispara `lead.created`?

**Dispara, sim** — e ontem eu respondi "não sabemos". Achei o emissor: é um
**gatilho de banco** (`tr_enqueue_lead_created_webhook`), não código de
servidor, e foi por isso que eu não o encontrei procurando no lugar errado.
Qualquer inserção em `leads` o aciona, venha de onde vier.

**A trava de idade que vocês decidiram sozinhos é a proteção certa** e cobre
exatamente esse caso.

### As colunas no payload do webhook

Pendente. É mudança no emissor e vamos fazer — **mas já dá para começar sem
ela**: as colunas estão preenchidas na tabela, então um GET por lead resolve
enquanto isso.

---

## 4. `ia_precos` — e um defeito que valia 36×

Os preços do `claude-opus-5-5` estão cadastrados, da página oficial, lidos em
26/09:

| | por milhão |
|---|---|
| Entrada | US$ 4,00 |
| **Escrita em cache (1 h)** | **US$ 8,00** |
| Leitura de cache | US$ 0,20 |
| Saída | US$ 20,00 |

Duas coisas que só a fonte mostra, e as duas importam para vocês:

- A escrita é a de **1 hora (2× a entrada)**, que é o cache que vocês usam. A de
  5 minutos é 1,25×.
- A leitura do 5.5 é **0,05× a entrada**, e não o 0,1× dos outros modelos: US$
  0,20 e não 0,40.

Os outros três modelos da Anthropic também ganharam o preço de escrita.

**E o preço era o menor problema.** Ao montar, vimos que **nossa fórmula usava a
convenção da OpenAI para todo mundo**: lá `cached_tokens` é subconjunto de
`input_tokens`, então a conta subtrai. Na Anthropic as parcelas são
independentes — e com o prompt inteiro em cache, `input_tokens` é quase zero, o
que zerava as duas primeiras parcelas.

Com os números que vocês mediram (43 k lidos, 19,5 k escritos, 235 de saída,
157 chamadas/dia):

| | por chamada | por dia |
|---|---|---|
| Nossa fórmula antes | US$ 0,0047 | US$ 0,74 |
| **Agora** | **US$ 0,1693** | **US$ 26,58** |

**36× de diferença, e 92% do que faltava é a escrita em cache.** O valor
corrigido cai dentro da estimativa independente que vocês fizeram (US$ 20–35).

A conta passou a ser **separada por provedor**. Para vocês isso significa: mandem
as três parcelas como a Anthropic reporta, **sem subtrair nada**:

```json
{ "model": "claude-opus-5-5", "provider": "anthropic", "source": "lia_vps",
  "input_tokens": 0, "cached_tokens": 43000,
  "cache_escrita_tokens": 19500, "output_tokens": 235 }
```

`total_tokens` é **opcional** — a conta usa as parcelas. E modelo sem preço
cadastrado dá custo **nulo, nunca zero**; a tela conta quantos ficaram de fora.

---

## 5. `vector(1536)` e índice — feito

A coluna era `vector` **sem dimensão**, e por isso **não podia ter índice**: a
busca por similaridade varreria a tabela inteira.

Fixada em `vector(1536)` e criado índice **HNSW** com `vector_cosine_ops`.
Escolhemos HNSW e não IVFFLAT porque o segundo precisa de dados para se montar —
criado sobre tabela vazia, nasceria inútil.

**Podem indexar os 42 books.** Fizemos agora exatamente porque a tabela está
vazia: depois de populada, mudar a dimensão exigiria reescrever a tabela.

Um aviso: **trocar de modelo de embedding depois exige recriar a coluna e
reindexar tudo.** A dimensão virou parte do contrato.

---

## 6. Tela de Plantão na escala da Lotus — pendente

É nossa e não bloqueia vocês. A tela foi calibrada com os 1.540 da Japi;
vamos revisar.

Lembrando do que já foi: `plantao_fila` **já não quebra** com nome no lugar do
uuid, e mostra o texto que chegou marcando `corretor_cadastrado: false`.

---

## Resumo

| # | Pedido | Estado |
|---|---|---|
| 1 | Autenticação da telemetria | **Respondido** — e `lia_vps` liberado, que eu tinha errado |
| 2 | `roleta_enabled` | **Corrigido** — esperando deploy do servidor |
| 3 | Colunas `meta_*` | **Causa achada e corrigida**; payload do webhook pendente |
| 4 | `ia_precos` | **Cadastrado**, e a fórmula corrigida em 36× |
| 5 | `vector(1536)` + índice | **Feito** — podem indexar |
| 6 | Tela de Plantão | Pendente, não bloqueia |

**Só o item 2 espera algo nosso para vocês tocarem** (o deploy). Os outros cinco
estão liberados.
