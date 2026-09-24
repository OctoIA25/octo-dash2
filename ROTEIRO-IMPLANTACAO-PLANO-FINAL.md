# Roteiro de implantação — Plano Final

Levantado em 22/09/2026, conferindo **objeto por objeto** contra o banco de
produção, e não pelo registro de migrations (que não bate: os arquivos do repo
e os nomes registrados seguem convenções diferentes).

**Medido:** 58 tabelas nascem deste plano. **57 não existem em produção**; só
`lead_toques` já foi aplicada.

**Atualizado em 23/09:** mais uma tabela (`pedido_de_nota`) e mais nove
migrations — **59 tabelas, 59 migrations**. As nove novas estão no fim da
lista, da 51 à 59, e não passaram pela conferência objeto-a-objeto de 22/09.
A 53 **já está em produção**: era uma porta aberta e foi fechada no mesmo dia.

---

## 1. A ordem

São **61 migrations**. A ordem abaixo é a alfabética **corrigida por
dependência** — quatro arquivos precisam sair do lugar natural.

> **A que mais importa:** `20260922_ajuda_manual_e_faq` é a *primeira*
> alfabeticamente entre as de 22/09, e usa a função `unaccent_ou_nao`, que só
> nasce em `20260922_leitura_de_documentos`, a *última*. Aplicar em ordem de
> nome **falha** com "function does not exist" — e falha no meio, deixando
> metade do plano aplicado.

Outras três, todas já resolvidas nesta ordem: `conciliacao_por_extrato` depende
de `financeiro_fase_1`; `conferencia_de_vendas`, `filtro_por_clique`,
`painel_comercial` e `relatorio_de_anuncios` dependem de `sem_acento`, criada em
`plantao_da_lia`; `materiais_de_estudo` depende de `cargos_e_permissoes`;
`condicoes_e_simulador` depende de `cadastro_de_construtoras` (a tabela
`construtoras` e a coluna `lancamentos.construtora_id` **não existem em
produção** — conferido em 22/09) e de `tipologias_do_lancamento`.

 1. `20260916_whatsapp_conversa_completa_vinculo_do_lead.sql`
 2. `20260916_whatsapp_conversa_segue_corretor_do_lead.sql`
 3. `20260916_whatsapp_gestor_ve_lead_sem_classificacao.sql`
 4. `20260917_view_vendas_assinadas.sql`
 5. `20260918_cadastro_de_construtoras.sql`
 6. `20260918_cadastro_de_origens.sql`
 7. `20260918_view_primeira_interacao.sql`
 8. `20260918_consistencia_diaria.sql`
 9. `20260918_lotus_leads_sem_corretor.sql`
10. `20260918_seed_construtoras.sql`
11. `20260918_seed_kpi_tempo_ate_corretor.sql`
12. `20260919_distribuicao_eventos.sql`
13. `20260920_base_de_conhecimento.sql`
14. `20260920_ultima_movimentacao_do_lead.sql`
15. `20260920_estado_do_handoff_no_lead.sql`
16. `20260920_graficos_de_leads.sql`
17. `20260920_liga_os_27_leads_por_nome.sql`
18. `20260920_lista_de_leads_por_aba.sql`
19. `20260920_pesos_do_score.sql`
20. `20260920_plantao_da_lia.sql`
21. `20260920_prerequisitos_por_etapa.sql`
22. `20260920_sinais_do_score.sql`
23. `20260920_tipologias_do_lancamento.sql`
24. `20260920_whatsapp_filtros_e_leitura.sql`
25. `20260921_agenda_da_lia.sql`
26. `20260921_campanhas_e_roi.sql`
27. `20260921_cargos_e_permissoes.sql`
28. `20260921_conferencia_de_vendas.sql`
29. `20260921_contratos_do_corretor.sql`
30. `20260921_custo_de_ia.sql`
31. `20260921_demandas_de_marketing.sql`
32. `20260921_painel_comercial.sql`
33. `20260921_filtro_por_clique.sql`
34. `20260921_financeiro_fase_1.sql`
35. `20260921_formularios_da_meta.sql`
36. `20260921_grafico_de_evolucao.sql`
37. `20260921_mapa_interligado.sql`
38. `20260921_materiais_de_estudo.sql`
39. `20260921_okrs_e_pdi.sql`
40. `20260921_relatorio_de_anuncios.sql`
41. `20260921_relatorio_de_recrutamento.sql`
42. `20260922_atas_de_reuniao.sql`
43. `20260922_conciliacao_por_extrato.sql`
44. `20260922_integracoes_honestas.sql`
45. `20260922_leitura_de_documentos.sql`
46. `20260922_ajuda_manual_e_faq.sql`
47. `20260922_user_profiles_so_colegas.sql` — **JÁ APLICADA EM PRODUÇÃO em 22/09**
     (era porta aberta: qualquer logado apagava qualquer conta). Fica na lista
     só para a ordem ficar completa; rodar de novo não faz mal.
48. `20260922_condicoes_e_simulador.sql` — **depende da 5**
     (`cadastro_de_construtoras`): referencia `public.construtoras(id)` e lê
     `lancamentos.construtora_id`. Conferido em produção em 22/09: **nenhuma das
     duas existe lá ainda**, então aplicar esta antes da 5 quebra na hora.
49. `20260922_etiqueta_de_quem_enviou.sql` — mexe em `whatsapp_messages`,
     tabela viva com 28.116 linhas. `ADD COLUMN` anulavel e instantaneo, mas
     os **dois UPDATE de backfill varrem a tabela inteira** e tocam ~14.256
     linhas. Rodar fora do horario de conversa.
50. `20260922_rede_de_unidades.sql` — **depende da 27**
     (`cargos_e_permissoes`): insere em `permissoes` e le `minhas_permissoes`.
     Acrescenta 2 colunas anulaveis em `tenants` (3 linhas): instantaneo.
51. `20260923_pedido_de_nota.sql` — **depende da 28** (`conferencia_de_vendas`,
     que cria `vendas`) e **da 5** (`cadastro_de_construtoras`, que cria
     `construtoras` e `construtora_cnpjs`). Nenhuma das tres existe em
     producao, entao a ordem alfabetica ja resolve — mas se alguem aplicar
     avulso, quebra na hora.
52. `20260923_card_do_site_vem_das_tipologias.sql` — **depende da 22**
     (`tipologias_do_lancamento`), de onde vem a tabela `tipologias` E a funcao
     `lancamento_preco_a_partir`, que esta migration chama.
     **Recria a view `portal_lancamentos`, que o site publico le hoje.** As
     colunas antigas saem iguais, na mesma ordem; as novas entram no fim. Se
     alguma migration futura tambem recriar essa view, ela tem que vir DEPOIS
     desta, ou as colunas `card_*` somem sem ninguem perceber.
53. `20260923_count_leads_mensal_fecha_o_publico.sql` — **JA APLICADA EM
     PRODUCAO em 23/09**, com autorizacao do chefe. Era porta aberta: o papel
     `anon`, sem login, recebia a contagem de leads de qualquer imobiliaria.
     Nao depende de nada do plano (mexe numa funcao que ja existe la). Fica na
     lista para a ordem ficar completa; rodar de novo nao faz mal.
54. `20260923_permissao_financeiro.sql` — **depende da 27**
     (`cargos_e_permissoes`, que cria a tabela `permissoes`). Sem ela o INSERT
     do catalogo falha com "relation does not exist".
     **Tambem escreve em `tenants.allowed_features`**, dando `financeiro` a
     quem ja tem `relatorios` — 2 dos 9 tenants. Sem esse UPDATE a chave nasce
     no catalogo e o menu do Financeiro some para TODOS os admins, sem erro
     nenhum na tela.
55. `20260923_financeiro_portal_e_liquido.sql` — **depende da 33**
     (`financeiro_fase_1`, que cria a funcao `financeiro_lancamentos`), **da 28**
     (`conferencia_de_vendas`, de onde vem `vendas` e `venda_repasses`) e da
     coluna `vendas.lead_id`. So troca o corpo da funcao; nao mexe em tabela.
56. `20260923_meta_confere_com_a_dash.sql` — **depende da 34**
     (`formularios_da_meta`, dona da tabela `meta_formularios` e da funcao do
     painel) e **da 26** (`campanhas_e_roi`, de onde vem `meta_insights_diarios`).
     Acrescenta 3 colunas anulaveis em `meta_formularios` — instantaneo — e
     traz `NOTIFY pgrst`, sem o qual as colunas ficam invisiveis para o app.
     **Precisa de deploy do servidor junto:** quem preenche `leads_na_meta` e
     o `formRoutes.js`, e sem ele a coluna fica nula para sempre e a tela diz
     "nao perguntado" eternamente.
57. `20260923_cinco_cargos.sql` — **depende da 27** (`cargos_e_permissoes`) e
     **da 54** (`permissao_financeiro`, que poe `financeiro` no catalogo: sem
     ela o INSERT do cargo Financeiro nao encontra a permissao).
     Cria 5 cargos por imobiliaria com gente e **nao atribui cargo a ninguem** —
     `cargo_id` fica nulo e a tela de todos continua como esta.
     **Tambem troca `financeiro_pode_ver`**, que e o porteiro de 20 funcoes do
     Financeiro: passa a aceitar tambem quem tem a permissao pelo cargo.
58. `20260924_cargo_juridico.sql` — **depende da 57**. Acrescenta o sexto
     cargo, que o chefe pediu a parte ("Adicionaria somente um Juridico") e a
     57 deixou de fora. Como ela, **nao atribui cargo a ninguem**.

 59. `20260924_portal_brokers_sem_user_profiles.sql` — **JA APLICADA EM
     PRODUCAO em 24/09**, para consertar um incidente que a 47 causou: o REVOKE
     de `user_profiles` para o `anon` derrubou a lista de corretores do SITE da
     Lotus, que lia essa view atraves de `portal_brokers`. Nao depende de nada
     do plano. Fica na lista para a ordem ficar completa.

 60. `20260924_so_gestor_redistribui_lead.sql` — **nao depende de nada do
     plano**: mexe em `leads`, `tenant_memberships` e `is_platform_owner()`,
     que ja existem em producao (conferido em 24/09). Cria a funcao
     `tg_leads_so_gestor_redistribui` e o gatilho
     `tr_leads_zzz_redistribuicao`, BEFORE UPDATE OF `assigned_agent_id`.
     **O `zzz` do nome nao e enfeite.** Os gatilhos disparam em ordem
     alfabetica, e `tr_leads_zz_assignee_guard` — que ja esta em producao —
     ANULA a atribuicao quando o destinatario nao e membro da casa. Este
     precisa rodar DEPOIS, para julgar o valor final. Renomear para algo que
     ordene antes inverte os dois e o guarda passa a julgar um valor que o
     outro ainda vai trocar.
     **Toca uma tabela em uso, no caminho mais quente do sistema.** Ver a
     secao 3: o caso 1 do teste (servidor sem JWT redistribui) e o que
     garante que roleta, bolsao e LIA continuam distribuindo; o caso 5
     (corretor pega lead sem dono) e o que garante que o botao "Assumir lead"
     nao quebra para os 14 corretores.

 61. `20260924_destino_por_tipo_de_lead.sql` — **nao depende de nada do
     plano**: so `tenant_bolsao_config`, que ja existe em producao. Acrescenta
     a coluna `destino_por_tipo` (jsonb NOT NULL DEFAULT '{}') — instantaneo —
     e traz `NOTIFY pgrst`, sem o qual a coluna fica invisivel para o app (ver
     2.1). O UPDATE que escreve a resposta da Lotus busca as pessoas **pelo
     nome** em `auth.users`: se o nome nao casar, a chave simplesmente nao e
     escrita e a tela diz que falta configurar. Nao ha uuid colado a mao.
     **Precisa de deploy do front junto:** quem le a coluna e o simulador
     (`server/distribuicao/regra.js` e `SimuladorPanel.tsx`), e sem ele a
     coluna fica gravada e ninguem consulta.
> **Estas onze entraram em 23 e 24/09, depois do levantamento.** A lista acima foi
> conferida objeto por objeto contra producao em 22/09; da 51 a 61 nao
> passaram por essa conferencia — a dependencia delas foi lida no codigo.

**Reaplicar `20260921_demandas_de_marketing.sql`**, que mudou DEPOIS de entrar
nesta lista: o `DEFAULT` de `mkt_demanda_eventos.em` passou de `now()` para
`clock_timestamp()`, e ha um `ALTER COLUMN` explicito porque a tabela nasce
com `CREATE TABLE IF NOT EXISTS` e em producao ela ja existe — sem ele a
correcao da ordem do historico nao chega la.

---

## 1.1 O ensaio de 24/09 — e os quatro erros de ordem que ele achou

**A lista acima nunca tinha sido executada.** As migrations rodaram uma a uma,
isoladas, cada uma num banco que já tinha as outras. Em 24/09 a sequência
inteira foi aplicada do zero, sobre um dump do esquema de produção daquele dia,
num banco limpo.

**Na primeira tentativa, quatro quebraram.** Todas por ordem — nenhuma por
defeito do SQL:

| migration | faltava |
|---|---|
| `consistencia_diaria` | a view `primeira_interacao`, que nascia depois |
| `ultima_movimentacao_do_lead` | vinha DEPOIS de `estado_do_handoff_no_lead`, que já recriava a mesma função com 5 colunas — e ela tentava reduzi-la a 3 |
| `filtro_por_clique` | a tabela `vendas_empreendimento_alias`, criada em `painel_comercial`, que vinha depois |
| `grafico_de_evolucao` | a mesma tabela |

A segunda linha é a que mais importa: **a ordem alfabética inverteu duas
migrations da mesma função.** `estado_do_handoff` vem antes de
`ultima_movimentacao` no alfabeto, mas é ela que ESTENDE o que a outra cria. O
erro (`cannot change return type of existing function`) não diz isso, e quem o
encontrasse no dia do deploy levaria um tempo até entender.

**A ordem acima já está corrigida.** Segunda tentativa, banco limpo de novo:
**58 aplicadas, 0 erros.**

### O que o ensaio NÃO prova

- **Os buckets continuam faltando.** Três testes falharam no banco limpo por
  causa disso — e é exatamente o que a seção 2.2 avisa. Confirma o aviso em vez
  de contradizê-lo.
- **O ensaio roda sem as permissões de `auth` e `storage`** (o dump de esquema
  sai sem ACL), então dois testes que dependem delas não puderam rodar lá.
  Passam no banco de desenvolvimento normal.
- **Dado real não foi testado.** O ensaio parte do ESQUEMA de produção, vazio
  de linhas. Migration que faz backfill roda sobre nada, e é onde uma surpresa
  ainda pode morar.

## 2. As três coisas que falham em silêncio

### 2.1 O cache de esquema do PostgREST

Toda migration que **acrescenta coluna** precisa terminar com:

```sql
NOTIFY pgrst, 'reload schema';
```

Sem isso a coluna existe no banco e é **invisível para o aplicativo** — sem
erro, o campo só vem vazio para sempre. Custou meia hora para ser descoberto no
P4.1, e ali era uma coluna só.

Quatro migrations estavam sem o aviso e foram corrigidas hoje:
`cadastro_de_construtoras`, `custo_de_ia`, `formularios_da_meta` e
`mapa_interligado` — justamente as que mexem em `leads`, `lancamentos`,
`condominios` e `agent_telemetry_events`, que produção já usa.

### 2.2 Buckets de storage não vêm em dump de esquema

Três precisam existir depois de aplicar, e **nenhum existe hoje**:

| bucket | nasce em | privado |
|---|---|---|
| `vendas-nf` | `20260921_conferencia_de_vendas` | sim |
| `mkt-demandas` | `20260921_demandas_de_marketing` | sim |
| `materiais-estudo` | `20260921_materiais_de_estudo` | sim |

Já existem em produção: `lead-documentos` e `corretor-documentos`.

Conferir **depois** de aplicar tudo:

```sql
select id, public from storage.buckets
 where id in ('vendas-nf','mkt-demandas','materiais-estudo');
```

O sintoma de esquecer é "Bucket not found" só na hora de alguém subir o
primeiro arquivo — dias depois, sem ligação aparente com o deploy.

### 2.3 `pg_default_acl` dá tudo ao anônimo em toda relação nova

Esta base concede acesso à chave pública em **qualquer tabela ou view criada**.
Toda migration do plano faz `REVOKE` explícito antes de `GRANT`. Depois de
aplicar, conferir que sobrou nada:

```sql
select table_name, string_agg(privilege_type, ', ') as sobrou
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee = 'anon'
   and table_name in (/* as 57 tabelas novas */)
 group by table_name;
```

O resultado esperado é **vazio**. Qualquer linha aqui é dado da casa saindo
pela API pública.

---

## 3. As que tocam tabelas em uso

Onze mexem em tabelas que produção já usa. Todas são `ADD COLUMN IF NOT EXISTS`
anulável — instantâneas no Postgres, sem reescrever tabela:

| migration | tabela viva | o quê |
|---|---|---|
| `cadastro_de_construtoras` | `lancamentos`, `condominios` | `construtora_id` |
| `cargos_e_permissoes` | `tenant_memberships` | `cargo_id` |
| `conferencia_de_vendas` | `tenant_memberships` | `nivel` + CHECK |
| `custo_de_ia` | `agent_telemetry_events` | 4 colunas |
| `formularios_da_meta` | `leads` | 6 colunas |
| `campanhas_e_roi` | `tenant_meta_leadgen_config` | — |
| `plantao_da_lia` | `lia_perguntas_corretor` | — |
| `etiqueta_de_quem_enviou` | `whatsapp_messages` (28.116 linhas) | `enviado_por` + 2 CHECK + backfill |
| `agenda_da_lia` | `lia_followups` | — |
| `relatorio_de_recrutamento` | `recrut_candidato` | — |
| `destino_por_tipo_de_lead` | `tenant_bolsao_config` (9 linhas) | `destino_por_tipo` jsonb |

`tenant_memberships` é a mais sensível: é o que autentica e dá permissão a todo
mundo. As duas alterações ali são colunas anuláveis novas, e o CHECK de `nivel`
valida contra linhas que acabaram de nascer nulas — não há como falhar por dado
existente.

E uma que **não é coluna**, e por isso é de outra categoria de risco:
`so_gestor_redistribui_lead` põe um gatilho `BEFORE UPDATE` em `leads`, que é a
tabela mais escrita do sistema. Coluna anulável nova não pode quebrar nada;
gatilho pode recusar uma escrita que hoje passa.

Os dois casos que decidem se ele pode subir, e os dois estão no teste:

1. **`auth.uid() IS NULL` passa.** Roleta, bolsão e LIA escrevem sem login. Sem
   essa porta, a distribuição automática inteira para — e o sintoma seria "os
   leads pararam de chegar nos corretores", dias depois, sem ninguém ligar ao
   gatilho novo.
2. **Corretor pegando lead sem dono passa.** É o botão "Assumir lead" do
   Bolsão, que os 14 corretores da Lotus usam todo dia. Um bloqueio que olhasse
   só "a atribuição mudou?" derrubaria esse botão.

Depois de aplicar, conferir os dois em produção com uma sessão de corretor de
verdade — o teste em SQL prova a regra, não prova que a tela continua
funcionando.

---

## 4. Depois de aplicar

1. **`gestao-equipe` precisa estar em `tenants.allowed_features`** ou Cargos e
   Reuniões ficam invisíveis no menu, com a rota aberta. A Lotus tem; JAPI e
   JAPITERCEIROS não.
2. **`integracoes` idem**, para a tela de Integrações aparecer.
3. Rodar a suíte SQL contra produção **não** — ela usa `ROLLBACK`, mas cria
   fixtures. Conferir por consulta, não por teste.
4. **Mandar `server/leadToques/PROMPT_LIA_ETIQUETA.md` para quem mexe na LIA.**
   Sem isso, a etiqueta nasce mostrando "sem autor" em tudo que for novo, e o
   botão "Assumir conversa" grava a decisão que ninguém lê.
5. O front precisa subir junto: várias telas leem funções que só existem depois
   destas migrations. Aplicar o banco sem o front deixa as telas antigas
   funcionando; aplicar o front sem o banco quebra as telas novas.

---

## 5. O que fica de fora

`20260917_bloqueio_atividade_tira_da_roleta` e o teste dele são de outra sessão
e **já estão em produção**. Não entram nesta lista.

`20260920_agenda_eventos_toque_id` foi aplicada em produção por outra pessoa em
22/09 às 19h35 — depois da correção da chave de API. Vale conferir com quem
aplicou antes de rodar o resto, para não haver duas mãos no mesmo banco.
