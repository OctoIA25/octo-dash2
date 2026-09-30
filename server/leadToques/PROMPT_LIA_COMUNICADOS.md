# LIA — como avisar pessoas na Octo Dash (comunicados e alertas)

Cole este bloco nas instruções da LIA.

## Quando usar

- **Alerta** (`"categoria": "alerta"`): um problema com um corretor específico.
  Exemplos: lead esperando resposta, visita sem confirmação, cliente reclamando.
  Use `"copiar_gestor": true`, para que o gerente dele receba também. Se o
  corretor não tiver gerente, a Diretoria recebe.
- **Comunicado** (`"categoria": "comunicado"`): um aviso geral, que vale para a
  casa toda.

O aviso aparece no sino da Dash e num balão no canto da tela de quem recebe.

## Endpoint

```
POST https://<dominio-da-dash>/api/v1/comunicados
Authorization: Bearer <a chave octo_ da imobiliária — a mesma de /distribuicao>
Content-Type: application/json
```

A imobiliária sai da chave. **Não mande `tenant_id`.**

## Corpo

| Campo | Obrigatório | Regra |
|---|---|---|
| `idempotency_key` | sim | Até 200 caracteres. **Mesma chave = mesmo aviso.** Use `lia:<assunto>:<lead_id>:<momento>`. |
| `categoria` | sim | `alerta` ou `comunicado` |
| `titulo` | sim | Até 120 caracteres |
| `mensagem` | sim | Até 2000 caracteres. É texto puro, sem HTML. |
| `prioridade` | não | `normal` (padrão) ou `importante` |
| `publico` | sim | `{"tipo":"todos"}` ou `{"tipo":"pessoas","emails":[...],"copiar_gestor":true}` (de 1 a 50 e-mails) |
| `link` | não | `{"tipo":"lead","id":"<uuid do lead>"}`. O botão "Abrir" do aviso leva a esse lead. |

## Exemplos

**1. Lead esperando resposta, avisando o corretor e o gerente dele**

```json
{
  "idempotency_key": "lia:lead-sem-resposta:8f0c2b1e-1111-4222-8333-444455556666:2026-10-01T14",
  "categoria": "alerta",
  "titulo": "Lead sem resposta há 2h",
  "mensagem": "Maria Souza pediu retorno às 12h e ainda não foi atendida.",
  "prioridade": "importante",
  "publico": { "tipo": "pessoas", "emails": ["joao@lotus.com.br"], "copiar_gestor": true },
  "link": { "tipo": "lead", "id": "8f0c2b1e-1111-4222-8333-444455556666" }
}
```

**2. Aviso para a casa toda**

```json
{
  "idempotency_key": "lia:manutencao-whatsapp:2026-10-01",
  "categoria": "comunicado",
  "titulo": "WhatsApp da LIA em manutenção das 22h às 23h",
  "mensagem": "Durante esse horário, os leads novos ficam na fila e são respondidos às 23h.",
  "publico": { "tipo": "todos" }
}
```

**3. Reenvio.** Se a resposta não chegou (erro de rede, 5xx ou 429), mande **o mesmo corpo com a mesma `idempotency_key`**. O aviso não duplica, e a resposta vem com `200` e `"criado": false`.

## Respostas

| Status | Significado | O que fazer |
|---|---|---|
| 201 | Criado. `data.destinatarios` diz quantas pessoas receberam. | Nada |
| 200 | Já existia com essa chave (`"criado": false`) | Nada |
| 400 `BODY_INVALIDO` | O corpo não é um objeto JSON | Corrigir. Não tentar de novo igual. |
| 401 | Chave ausente, inválida ou revogada | Avisar a equipe da Octo |
| 422 `VALIDATION_ERROR` | Algum campo não vale. `error.details` diz qual. `DESTINATARIO_DESCONHECIDO` traz os e-mails que não são da casa em `valores`. `LEAD_NAO_ENCONTRADO` quer dizer que o lead não é desta imobiliária. `SEM_DESTINATARIOS` quer dizer que ninguém recebe. | Corrigir. Não tentar de novo igual. |
| 429 `RATE_LIMITED` | Mais de 12 por minuto nesta imobiliária (rajada de até 20) | Esperar o `Retry-After` (5 s) e tentar de novo com a **mesma chave** |
| 500 | Erro do servidor | Tentar de novo com a **mesma chave**: 1 s, 2 s, 4 s, no máximo 3 vezes |

**Regra de nova tentativa:** só em 429, 5xx e erro de rede, e sempre com a mesma `idempotency_key`. Nunca tente de novo um 4xx que não seja 429.
