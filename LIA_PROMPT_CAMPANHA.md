# LIA — o que precisa mudar do lado dela

Este arquivo acumula **tudo que exige ajuste na LIA** (fluxos do n8n, prompts,
gravação em tabela) por causa das mudanças que estamos fazendo na Dash. A ideia
é enviar tudo de uma vez, no fim do trabalho, para ela se ajustar com base no
conjunto — e não a cada mudança.

Cada item diz o que mudou na Dash, o que a LIA precisa fazer e por quê. Os itens
são acrescentados conforme o trabalho avança; nada aqui foi enviado ainda.

Última atualização: 18/09/2026.

---

## 0. Antes de tudo: metade da LIA parou de gravar em 26–27 de agosto

Não é consequência do nosso trabalho — é o estado em que encontramos o sistema, e
ele muda o que faz sentido pedir. Medido em produção em 18/09:

| Tabela | Linhas | Última escrita | Estado |
| --- | --- | --- | --- |
| `lia_followups` | 2.733 | 18/09, 02:20 | **viva** |
| `lia_corretor_messages` | 15.286 | 27/08 | muda há 21 dias |
| `lia_lead_facts` | 5.746 | 27/08 | muda há 21 dias |
| `lia_visitas` | 629 | 27/08 | muda há 21 dias |
| `lia_fila_vistas` | 21 | 27/08 | muda há 21 dias |
| `lia_bolsao_estado` | 1 | 26/08 | muda há 22 dias |
| `lia_regras` | 9 | 26/08 | muda há 22 dias |
| `lia_captacoes` | 1 | 28/06 | muda há 81 dias |
| `lia_empreendimento_chunks` | 0 | — | **vazia** |
| `lia_empreendimento_views` | 0 | — | vazia |
| `lia_interaction_examples` | 0 | — | vazia |

A LIA **está funcionando**: grava em `whatsapp_messages` e manda evento para
`lead_events` todo dia. Então ela não caiu — ela passou a escrever em outro lugar
e deixou as tabelas estruturadas para trás.

**Pergunta para quem mantém o n8n:** o que aconteceu em 26–27/08? Foi troca de
fluxo, migração de versão ou um nó que quebrou em silêncio? A resposta decide se
os itens 1 a 4 abaixo são "religar" ou "construir de novo".

---

## 1. O handoff não diz para quem

**Como está:** a LIA já manda `lia.handoff_corretor` para
`POST /api/v1/lia/lead-events`, e há 62 eventos gravados. Mas **100% deles têm
`metadata` e `para` nulos**. O evento diz que houve handoff; não diz para quem.

**O que precisa:** enviar no payload o corretor de destino — `para` com o id do
corretor e `metadata` com o que mais existir (motivo, fila, score no momento).

**Por quê:** é esse evento que marca o instante em que o lead deixa de ser da LIA
e passa a ser do corretor. Sem o destinatário, a Dash não consegue nem mostrar o
extrato correto na ficha do lead nem começar a contar o prazo de atendimento.

---

## 2. Visitas: a tabela parou, e o card da tela depende dela

**Como está:** `lia_visitas` tem 629 registros, todos até 27/08, **nenhum com
data de hoje ou futura**. O card "Visitas hoje" da tela Início mostra zero — e
mostraria zero mesmo se a gente trocasse a fonte, porque o dado não existe.

**O que precisa:** a LIA voltar a gravar a visita que agenda, com `data`,
`horario`, `status` e `lead_id` preenchidos.

**Por quê:** hoje as visitas agendadas pela LIA são invisíveis para o CRM inteiro.
Dos 489 leads que têm visita registrada nessa tabela, **todos os 489 continuam na
etapa "Novos Leads"** no funil. Nenhum relatório enxerga essas visitas.

**Decisão pendente com o Erick (pergunta 15 do plano):** visita marcada pela LIA
deve mover o lead de etapa? Se sim, a LIA precisa atualizar `leads.status` junto,
ou avisar a Dash para fazer isso.

---

## 3. O corretor do lead importado deixou de vir preenchido

**Como está:** o webhook `lead.created` manda o campo `corretor`, que vem de
`leads.assigned_agent_name`.

**O que mudou na Dash:** o importador da Santa Ângela parou de gravar esse campo
(commit `94ef9d3`). Ele gravava o nome vindo da origem sem o identificador, e
nome sem id faz o lead nunca entrar em distribuição — foram 506 leads carimbados
assim, 488 ainda parados.

**O que precisa:** a LIA não pode depender de `corretor` vir preenchido nos leads
da Santa Ângela. Quando vier nulo, significa "sem corretor ainda", não "erro".

**Por quê:** o nome da origem continua disponível, mas em
`custom_fields.santa_angela_corretor_nome` — é lá que ele serve para conferência,
sem atrapalhar a distribuição.

---

## 4. Sinais da conversa para o score do lead

**Como está:** `lia_lead_facts` é onde a LIA grava o que descobriu na conversa
(intenção, preferência de visita, orçamento, cidade). Tem 5.746 linhas, **todas
da Imobiliária Japi**, e parou em 27/08. Para a Lotus são zero linhas.

**O que precisa:** voltar a gravar, e passar a gravar também para a Lotus.

**Por quê:** o score de 0 a 100 do plano (item P1.7) depende desses sinais. Sem
eles, todo lead nasce com 50 e fica com 50 para sempre — o número existiria na
tela sem significar nada.

---

## 5. Não dá para saber quem mandou a mensagem

**Como está:** das 1.161 mensagens de saída da Lotus, **nenhuma** tem autor
gravado (`sent_by_user_id`). Corretor e LIA usam o mesmo canal, e a coluna só é
preenchida quando alguém manda pelo chat da própria Dash.

**O que precisa:** a LIA carimbar as mensagens que ela mesma envia, de qualquer
forma que permita distinguir depois.

**Por quê:** a regra de "lead atendido" do plano (P1.1) diz *"o corretor mandou
mensagem ao lead"*. Hoje isso é impossível de medir. Sem o carimbo, a régua de
atendimento precisa se apoiar só em atividade agendada e toque registrado.

---

## 6. Base de conhecimento por empreendimento está vazia

**Como está:** `lia_empreendimento_chunks` tem **zero linhas**.

**O que precisa:** saber se a LIA lê o conteúdo dos books em PDF de outro jeito,
ou se essa funcionalidade nunca chegou a entrar em operação.

**Por quê:** o item P2.3 do plano — base de conhecimento por empreendimento com
botão "Testar busca" — assume que esse caminho existe. Se a tabela nunca foi
usada, o item é construir do zero, não melhorar.

---

## 7. Permissões das tabelas da LIA mudaram (já aplicado em produção)

**O que mudou:** em 18/09 as 14 tabelas `lia_*` foram fechadas para os papéis
`anon` e `authenticated` (commit `e44c608`). Três delas estavam sem RLS e eram
legíveis por qualquer pessoa com a chave pública do site.

**O que precisa:** confirmar que os fluxos do n8n usam a **service role key**, não
a anon key. Com a service role, nada muda para eles.

**Por quê:** conferimos que nenhuma escrita ocorreu nessas tabelas nos últimos 21
dias, então a mudança não interrompeu nada em operação. Mas se algum fluxo
adormecido usar a anon key, ele vai falhar com erro de permissão ao ser religado —
e é melhor saber disso agora do que na hora.
