# Os cargos do print, linha a linha — o que a Dash cumpre hoje

Escrito em 23/09/2026, contra o print que o chefe mandou: **CORE, preparado
para a Imobiliária Japi** — cinco cargos e dezesseis permissões.

Os **cinco cargos entram** (`20260923_cinco_cargos.sql`). Das dezesseis linhas,
quatro viram permissão de cargo, sete já existem por outro caminho, uma espera
uma decisão dele, e **quatro são funções que a Dash não tem**.

---

## Antes da tabela, duas observações

**1. Os números são da Japi, não da Lotus.** O print diz 39 pessoas, sendo 27
corretores. Medido em produção em 23/09: a Japi tem 39 corretores e 1 admin; a
**Lotus tem 20 pessoas** — 14 corretores, 4 admins e 2 líderes. Os cargos
servem de forma; os tamanhos não transferem.

**2. Catorze das dezesseis linhas são AÇÕES, não abas.** "Redistribuir",
"aprovar", "publicar", "editar", "negociar". A regra desta casa, decidida com o
chefe em 21/09, é que **o cargo manda no que se VÊ e o papel manda no que se
PODE** — porque são 277 políticas de segurança em 97 tabelas, 61 delas lendo o
papel.

Transformar as dezesseis em caixinhas de cargo criaria catorze que não fazem
nada. É a doença que este sistema já tem: **17 das 33 permissões do catálogo
são gravadas e nunca lidas**, e quem desmarca uma delas acredita ter
restringido algo. Não somamos mais catorze.

---

## A tabela, marcada

| Linha do print | Como está na Dash |
|---|---|
| **Ver caixa e resultado da empresa** | ✅ **vira permissão de cargo** (`financeiro`) |
| **Ver relatórios da própria unidade** | ✅ **vira permissão de cargo** (`relatorios`) |
| **Alterar configurações e usuários** | ✅ **vira permissão de cargo** (`gestao-equipe`) |
| **Cadastrar e editar imóveis** | ✅ a aba vira permissão (`imoveis`); *editar* em si continua por captador e papel |
| Ver e atender os próprios leads | já é o padrão do corretor — papel, não cargo |
| Ver leads de toda a equipe | já existe: o líder vê a equipe. É filtro de **linha**, não aba |
| Ver documentos pessoais de clientes | já existe por papel (P4.7) |
| Gerar contratos e enviar para assinatura | existe o P4.3, mas é **contrato do corretor** (aceite de termo), não contrato de cliente |
| Publicar e tirar do ar nos portais | o campo existe; **sem trava própria** — `imovel_autoriza` só conhece `editar` e `ver_proprietario` |
| **Redistribuir leads entre corretores** | ⚠️ **sem trava nenhuma hoje** — ver abaixo |
| **Editar comissões** | ⚠️ existe, e é **mais restrito que o print** — ver abaixo |
| Ver relatórios das duas unidades | ⏸ o F.3 está pronto, mas há **zero redes cadastradas**: falta ele declarar quem é matriz de quem |
| Aprovar desconto em proposta | ❌ não existe |
| Aprovar repasses aos proprietários | ❌ não existe — o repasse daqui divide comissão entre **pessoas** (corretor, líder, captador), não paga proprietário |
| Negociar acordo de aluguel em atraso | ❌ não existe — **não há módulo de locação** |
| Abrir e responder chamados | ❌ não existe |

---

## As duas que precisam de decisão dele

### "Redistribuir leads entre corretores" — hoje não tem dono

No print, só Diretoria e Gerente redistribuem. Na Dash **não existe trava
nenhuma**: a regra de escrita em `leads` exige apenas *"é da mesma
imobiliária"*. Qualquer corretor reatribui qualquer lead da casa — inclusive
puxar para si o lead de outro corretor, sem registro de que fez isso.

Isso não é "o cargo deveria controlar". É "nada controla". E a pergunta é de
negócio antes de ser de código: **corretor pode pegar lead de colega?**

### "Editar comissões" — o print afrouxaria a trava

No print, a Diretoria edita comissões. Na Dash o gatilho
`venda_protege_comissao_pct` deixa **só o dono da plataforma** mexer no
percentual — nem o admin da imobiliária.

Copiar o print seria **tirar** uma proteção que existe. Fica como está até ele
dizer o contrário, com todas as letras.

---

## O que foi entregue

Os cinco cargos nascem em toda imobiliária que tenha gente dentro, com as abas
recortadas pelo que aquela casa contratou:

| Cargo | Papel | O que vê |
|---|---|---|
| **Diretoria** | admin | tudo o que a casa contratou |
| **Gerente** | team_leader | leads, equipe, imóveis, métricas, relatórios, central de leads, metas |
| **Financeiro** | corretor | financeiro, relatórios, jurídico, notificações |
| **Atendimento** | corretor | leads, conversas, notificações |
| **Corretor** | corretor | leads, imóveis, métricas, estudo de mercado, conversas |

**Ninguém foi movido para cargo nenhum.** A migração só cria; quem atribui é
gente, pela tela de Cargos, uma pessoa por vez. Sem cargo, o app cai na regra
antiga — então a tela de todo mundo continua exatamente como está hoje.

### Um ajuste que o cargo Financeiro exigiu

O porteiro do Financeiro (`financeiro_pode_ver`) sempre exigiu admin da
imobiliária. Um cargo "Financeiro" com papel de corretor mostraria o menu e
abriria **uma tela vazia** — a promessa sem a entrega, e sem erro para a
pessoa reclamar.

A alternativa seria dar papel de `admin` a quem cuida do dinheiro, o que
abriria junto as outras 61 políticas: apagar lead, mexer em imóvel, gerir
equipe.

Então o ajuste foi cirúrgico: **uma função aprendeu a perguntar ao cargo.** É
o porteiro único de todo o Financeiro, e quem tiver a permissão `financeiro`
pelo cargo passa — sem virar admin em mais nada. O teste prende os dois lados:
o Financeiro entra, o Atendimento não.
