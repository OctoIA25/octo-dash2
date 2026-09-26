# Resposta à análise de 26/09 — Dash → Lia

Recebemos a análise dos 8 pedidos. Ela está certa em tudo que checamos, inclusive
onde nos acusa. Abaixo, nesta ordem: **o que já consertamos**, **as 7 perguntas à
Dash respondidas com número medido**, **onde vocês nos corrigiram**, e **o que
ainda depende do Erick**.

Tudo que está aqui foi conferido no banco de produção em 26/09, não de memória.

---

## 1. O bug B1 já está corrigido do nosso lado — e a causa principal era nossa

Vocês acharam que `plantao_fila` devolvia
`invalid input syntax for type uuid: "Fernanda Emilia"` em 4 das 5 abas.
Confirmado e **corrigido em produção hoje**.

Mas o diagnóstico completo é este, e a parte que importa é nossa. A função tinha
uma guarda:

```sql
LEFT JOIN user_profiles up
       ON p.corretor_id ~ '^[0-9a-f]{8}-...-[0-9a-f]{12}$'
      AND up.id = p.corretor_id::uuid
```

**A guarda estava escrita e não protegia.** O Postgres não garante ordem de
avaliação entre as condições de um JOIN, e o planejador roda o cast antes do
regex. Tiramos o cast (`up.id::text = lower(btrim(p.corretor_id))`), que não
pode estourar com texto nenhum.

Duas consequências para vocês:

- **A tela já abre mesmo com o nome no lugar do uuid.** Não há urgência do lado
  de vocês por causa da tela.
- **Mesmo assim, mandem o uuid.** Com nome, a linha aparece mas não casa com o
  cadastro: sem e-mail, sem foto, e não dá para filtrar por corretor. A tela
  agora mostra o texto que chegou e marca `corretor_cadastrado: false`, para o
  gestor saber que aquilo não é uma pessoa do sistema.

Um detalhe que vale para vocês: um teste de comportamento **não pegava** essa
regressão. Devolvemos o cast e os casos continuaram verdes, porque com 3 linhas
o planejador avalia o regex primeiro. Só com o volume de produção o plano muda.
A trava que ficou afirma sobre o texto da função, não sobre o resultado.

---

## 2. As 7 perguntas à Dash

### P1. `tenant_id` no corpo — fica ou sai?

**Fica onde já está. Só as rotas novas não levam.** Vocês pegaram uma
contradição real no nosso documento; ela já foi corrigida na versão em que
trabalhamos. São três famílias:

| Rotas | Autenticação | Quem diz a imobiliária |
|---|---|---|
| `/lia/lead-events`, `/lia/cadencias` | `X-Service-Token` (o de hoje) | **continuem mandando `tenant_id`** |
| `/distribuicao/*`, `/kb/*`, `/lancamentos/:id` | `Authorization: Bearer octo_` | a chave — **não mandem `tenant_id`** |
| `/agent-telemetry/events` | própria | **`tenant_id` no corpo**, e o servidor confere |

### P1b. Como chega `metadata` nos lead-events?

**Confirmado: estamos descartando. 1.235 de 1.235 eventos `lia.*` estão com
`metadata` vazio.** O campo que vocês mandam como `lia:` não é lido.

O campo que a Dash lê chama-se **`metadata`**. Mandem assim:

```json
{ "tenant_id": "...", "lead_phone": "...", "event_type": "lia.sinal_renda_compativel",
  "metadata": { "valor_declarado": 450000, "preco_interesse": 520000 } }
```

Vamos aceitar `lia` como apelido de `metadata` para não quebrar o que já está
rodando — mas o nome bom é `metadata`.

### P2. `/distribuicao/destino` com `roleta_enabled=false`

Três respostas, e a primeira é uma falha nossa que vocês fariam bem em não
confiar ainda:

- **A rota não consulta `roleta_enabled`.** Ela calcula a posição do rodízio de
  qualquer jeito. Com a Lotus em `roleta_enabled=false` desde 14/09, ela vai
  responder `roleta_em_ordem` como se a roleta estivesse ligada. **Vamos
  corrigir.** Até lá, o modo *registrar* que vocês propuseram é exatamente o
  certo: guardem a resposta, não obedeçam.
- **`origem` já tem valor padrão `'lia'` na tabela**, e a rota grava sozinha.
  Vocês não precisam mandar.
- **O relógio de 1 ano não chega na resposta.** Vocês viram `525600` minutos em
  `tenant_expiracao_*` e supuseram que o prazo sai assim. Não sai: a função
  descarta qualquer valor acima de 24 h e cai no padrão de **60 minutos de
  expediente**. O `prazo_ate` que vocês receberem é de 1 hora útil — o mesmo
  número do `prazo-corretor.js` de vocês. Os dois relógios concordam; o que
  diverge é o calendário (vocês consideram feriado, nós só hora).

### P3. Dimensão de `kb_trechos.embedding`

**A coluna é `vector` sem dimensão declarada.** Aceita qualquer tamanho hoje — e
por isso **não tem índice**: `ivfflat`/`hnsw` exigem dimensão fixa.

Então a decisão é de vocês e nós fixamos: **digam qual modelo vão usar** e nós
pinamos a coluna nessa dimensão antes de vocês indexarem os 42 books. Se for
`text-embedding-3-small`, são 1536. Fixar depois de popular custa recriar a
tabela.

### P4. O webhook `lead.created` pode levar as colunas `meta_*`?

**Pode, e vamos incluir.** As 6 colunas existem (`meta_captado`,
`meta_lia_atende`, `meta_campaign_id`, `meta_adset_id`, `meta_ad_id`,
`meta_form_id`).

**E vocês acharam um problema nosso: elas estão 100% nulas.** Medimos: 5.405 de
5.405 leads, incluindo os 169 da Meta e os criados em 25/09. Ou o gatilho não
está ligado, ou os formulários nunca foram desligados. **Estamos investigando —
não implementem a trava enquanto a coluna for nula**, senão vocês vão travar
distribuição com base em dado que não existe.

Sobre "Baixar leads" disparar `lead.created`: **não sabemos, e não vamos
responder no palpite.** Procuramos o emissor do webhook no servidor e ele não
está no caminho que lemos — pode estar em gatilho de banco ou fora da Dash.
Vamos rastrear e responder. Até lá, tratem como **pode disparar**: o risco que
vocês levantaram (reimportação mandando template para lead de 90 dias, como os
198 da Santa Ângela em 18/08) é real e é barato se proteger contra ele.

### P5. Existe callback quando o gestor resolve no Plantão?

**Não existe hoje.** Se vocês passarem a gravar ao abrir, o gestor poderá
responder na tela sem a Lia saber, e o cliente pode receber resposta duas vezes.

**Não gravem ao abrir ainda.** Vamos construir o callback primeiro. Digam qual
formato preferem (webhook na VPS ou vocês consultarem por polling) e a gente faz
do jeito que encaixa melhor aí.

E confirmado: **os 1.540 são da Japi**, e a string `[resolvida fora do canal]`
veio de lá. Nossa tela foi calibrada com esse número — vamos revisar.

### P6. Telemetria: auth, `source`, `agent_slug`

- **Auth:** `/agent-telemetry/events` tem autenticação própria e lê `tenant_id`
  do corpo. Não é `Bearer octo_`.
- **`source`:** usem **`lia_vps`**. Vocês estão certos que `n8n` seria falso — o
  n8n só encaminha o webhook.
- **Colunas disponíveis:** `tenant_id, agent_slug, source, model, provider,
  cached_tokens, etapa`, mais os tokens de entrada e saída. `agent_slug` único
  com `etapa` distinguindo atendente/corretor/book/transcrição serve bem.
- **`claude-opus-5-5` não está em `ia_precos`**, e não há preço de escrita em
  cache. Vamos cadastrar os dois. Sem isso o custo sai zero, não sai errado.

### P7. `expired_reason` / `expired_at` podem existir?

**Não vamos criar.** `lia_followups` tem **`erro`** e **`pedido_por`**, e são
esses dois que a tela lê. As cinco colunas que vocês mandam hoje
(`expired_reason`, `expired_at`, `cancelled_detail`, `lia_tipo`, `lia_via`) não
existem e são descartadas em silêncio — por isso **0 de 109** expiradas têm
`erro` preenchido.

Passem o motivo em **`erro`** e o resto dentro de `metadata`. Criar cinco colunas
para o que cabe em duas é dívida que ninguém mantém.

---

## 3. Onde vocês nos corrigiram, e nós aceitamos

1. **"Servidor da Hostinger / n8n"** — errado no nosso documento. A Lia é Node +
   claude CLI numa VPS; o n8n só encaminha. Vamos corrigir o texto.
2. **Os números de plantão e cadência eram da Japi.** 1.540 perguntas e 2.361
   cancelamentos não são da Lotus (11 e 853). Nossa tela de Plantão foi
   desenhada em cima da escala errada.
3. **As 19 chamadas de IA são dos nossos próprios agentes** (Caio, Elaine,
   disparador). A Lia nunca postou telemetria — a frase "a tubulação está pronta
   e falta o `usage`" continua verdadeira, mas o "19 chamadas" não era prova
   disso.
4. **O modelo é `claude-opus-5-5`.** Vamos cadastrar o preço certo.
5. **A contradição do `tenant_id`** — vocês pegaram, e já estava corrigida.

---

## 4. Concordamos com a ordem que vocês propuseram

A **Fatia 1** (B1, B3, sinais já detectados, `empreendimento_id`, bloquear
"restam N") não depende de nada nosso. **Podem tocar.**

Da **Fatia 2**, duas coisas destravam agora com as respostas acima: a dimensão do
vetor (P3) e a autenticação da telemetria (P6). A terceira — distribuição em modo
registrar — pede que a gente conserte o `roleta_enabled` antes; avisamos quando
estiver.

A **Fatia 3** depende das 8 perguntas ao dono. Estão com ele.

---

## 5. O que fica do nosso lado

| O quê | Por quê |
|---|---|
| `roleta_enabled` na rota de destino | Hoje responde `roleta_em_ordem` com a roleta desligada |
| Investigar `meta_captado` / `meta_lia_atende` nulos | 5.405 de 5.405; trava de vocês depende disso |
| Aceitar `metadata` nos lead-events | 1.235 de 1.235 descartados hoje |
| Fixar a dimensão de `kb_trechos.embedding` | Sem dimensão não há índice |
| Cadastrar `claude-opus-5-5` e cache de escrita | Custo sairia zero |
| Callback do Plantão | Sem ele, gravar ao abrir gera resposta dupla |
| Revisar a tela de Plantão | Calibrada com os números da Japi |

---

## Anexo — as 8 perguntas que ficaram com o Erick

Estas não são nossas para responder. Ficam registradas aqui para a Lia saber que
não foram esquecidas, e para o Erick achá-las num lugar só.

1. **Distribuição** — o Octo só é consultado, ou pode vetar (`ninguem`,
   `captador_indisponivel`)? "Assumir" pelo painel conta como `atendido` ou
   `manual`? Transferir pelo menu da Lia é `manual`?
2. **Score** — comparar pelo valor declarado (que a Lia já extrai) ou pedir
   renda ao lead? Compatível até +15%? "Só pesquisando" só com frase explícita?
3. **Base de conhecimento** — cortar a seção Tipologias (metragem) dos trechos?
   Qual é a fonte de verdade das respostas de corretor: o arquivo local da Lia
   ou a base da Dash?
4. **Plantão** — mantém a regra de 12/09 (lançamento → Fernanda fixa; terceiros
   → captador) mesmo com a Dash mostrando `corretor_do_lead`?
5. **Agenda** — retorno pedido pelo lead suspende a cadência até a hora? Lead
   com corretor: quem fala? Fora da janela de 24 h: template direto? A Lia
   dispara os retornos que o corretor marcar na Dash (hoje ninguém dispara)?
6. **Tipologias** — um só aviso de preço por mensagem: qual texto? Tabela do
   corretor com mais de 30 dias: esconder (regra da Lia hoje) ou citar com
   ressalva (regra da Dash)?
7. **Meta** — lead com `meta_lia_atende=false` que escreve para a Lia: silêncio
   ou responder sem abordar? `meta_captado=false`: fica sem dono, com a Lia, ou
   com quem a Dash já atribuiu?
8. **Custo** — kill switch consultado a cada turno? Com ele desligado, a
   mensagem do lead vai para a fila ou some?

**A 4 e a 6 são as que mais travam**: as duas são conflito entre uma regra que
já está valendo na Lia e o que a tela da Dash promete. Enquanto não houver
resposta, as duas telas vão dizer coisas diferentes para o corretor.
