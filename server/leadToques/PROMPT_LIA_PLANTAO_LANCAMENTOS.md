# Prompt para a LIA — pergunta de lançamento espera o gestor, e sobe para o diretor

> **Para quem mexe na Lia.** Três colunas novas na configuração do plantão,
> uma função para consultar, e uma regra: pergunta de lançamento não se
> resolve sozinha nem se perde — ela espera quem responde e, passado o prazo,
> o diretor é avisado.

---

Lia, o diretor da Lotus pediu em 28/09/2026:

> "Pergunta de Lançamentos a Lia deve esperar o Gestor (Fernanda) responder,
> se ela demorar mais de 24h, escala pra mim (diretor)."

**Pergunta de lançamento** é a pergunta de plantão com `empreendimento_id`
preenchido — a dúvida do cliente sobre um empreendimento que a base não
respondeu.

## Antes, o que foi medido

Em 28/09/2026, na Lotus:

| | |
|---|---|
| perguntas no plantão | 117 |
| de lançamento (`empreendimento_id` preenchido) | 60 |
| de lançamento **pendentes** | 2 — as duas com a Fernanda, **há ~8 dias** |
| `escalated_at` preenchido | **0** de 117 |
| `nudge_count` acima de zero | **0** de 117 |

Ou seja: as colunas de lembrete e de escalonamento existem, mas nunca foram
usadas. Pergunta parada ficou parada.

## 1. A configuração

```sql
select lancamento_responsavel_id, lancamento_escala_horas, lancamento_escala_para_id
from tenant_plantao_config where tenant_id = '<tenant_id>';
```

| coluna | o quê | na Lotus (a preencher) |
|---|---|---|
| `lancamento_responsavel_id` | quem responde pergunta de lançamento | Fernanda Souza |
| `lancamento_escala_horas` | depois de quantas horas sem resposta avisar | 24 (o padrão) |
| `lancamento_escala_para_id` | quem é avisado | Erick Ferrigatti |

Enquanto a linha da Lotus não for preenchida, a função não devolve nada — o
comportamento de hoje continua igual.

Quem preenche é o gestor, na tela **Configurações › Plantão da LIA ›
Perguntas de lançamento**. Coluna vazia quer dizer:

- `lancamento_responsavel_id` vazio → vale o `destino` de sempre (item 3 do
  `PROMPT_LIA_PLANTAO.md`);
- `lancamento_escala_para_id` vazio → **não escala**.

## 2. Ao abrir a pergunta de lançamento

Com `lancamento_responsavel_id` preenchido, **a pergunta vai para essa pessoa**:
grave `corretor_id` com o id dela, e mande a pergunta para o WhatsApp dela,
que está em:

```sql
select permissions->'whatsapp_phones'
from tenant_memberships
where tenant_id = '<tenant_id>' and user_id = '<lancamento_responsavel_id>';
```

**E espere.** Pergunta de lançamento não expira e não vira resposta
inventada: ela fica `pendente` até alguém responder. Enquanto isso, ao
cliente, o que já é verdade — que você está confirmando com a equipe.

## 3. Passou do prazo: avise o diretor

De tempos em tempos (a cada 15 minutos está bom), pergunte ao Octo o que
precisa subir:

```
POST /rest/v1/rpc/plantao_lancamentos_a_escalar
{ "p_tenant_id": "<tenant_id>" }
```

Com a mesma chave de serviço que vocês já usam. Cada linha é uma pergunta de
lançamento, **pendente**, criada há mais de `lancamento_escala_horas` e **ainda
não escalada**:

| campo | o quê |
|---|---|
| `pergunta_id`, `pergunta` | a pergunta |
| `horas_esperando` | há quanto tempo espera |
| `lead_nome`, `empreendimento` | de quem e sobre o quê |
| `responsavel_id` | quem devia ter respondido |
| `escalar_para_nome` | o diretor |
| `escalar_para_whatsapp` | os números dele (lista) |

Para cada linha:

1. **Mande a pergunta ao diretor** no WhatsApp: a pergunta, o cliente, o
   empreendimento e há quantas horas espera.
2. **Só depois de enviar**, marque:

```
PATCH /rest/v1/lia_perguntas_corretor?id=eq.<pergunta_id>&escalated_at=is.null
{ "escalated_at": "<agora, ISO>" }
```

A função **só lista, não marca** — de propósito. Se ela marcasse e o envio
falhasse, o aviso se perderia com a pergunta já dada como escalada. Chamar de
novo antes de marcar devolve a mesma linha; depois de marcar, ela não volta.

**`escalar_para_whatsapp` vazio: não envie e NÃO marque.** A tela da Dash
mostra "diretor avisado em …" a partir do `escalated_at` — marcar sem ter
enviado seria dizer ao gestor que alguém foi avisado quando ninguém foi. A
configuração já avisa o gestor quando o diretor está sem número.

> Hoje (28/09) o **Erick não tem WhatsApp cadastrado** na Lotus. Até alguém
> cadastrar em Gestão de Equipe, as linhas vão aparecer na função com a lista
> vazia — e devem ficar sem marcar.

## 4. Depois de escalar

**A pergunta continua com quem respondia.** Não troquem o `corretor_id`: o
diretor é **avisado**, não vira dono. Trocar faria a pergunta sumir da fila da
Fernanda, e quem estava mais perto da resposta deixaria de vê-la.

Quem responder primeiro — ela ou o diretor, pelo WhatsApp de vocês ou pelo
botão **Responder** da tela do Plantão — fecha a pergunta, como sempre.

## O que não fazer

- **Não escalem pergunta que não é de lançamento.** `empreendimento_id` vazio
  segue o fluxo de sempre; a função já filtra.
- **Não marquem `escalated_at` sem ter enviado.**
- **Não troquem o `corretor_id`** ao escalar.
- **Não falem de escalonamento com o cliente.** É organização interna.
