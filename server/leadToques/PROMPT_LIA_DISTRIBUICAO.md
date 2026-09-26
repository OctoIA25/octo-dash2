# A Lia passa a perguntar de quem é o lead

**Para quem mexe na Lia (n8n).** Duas rotas novas, já no ar em produção. A
primeira responde *de quem é este lead*; a segunda registra *o que a Lia fez*.

**Nada aqui tira a distribuição da Lia.** Foi decidido assim em 19/09: a Lia
continua atribuindo o lead. O Octo só passa a ser consultado — ele responde e
guarda a resposta. A rota **não escreve em `leads`**, de propósito.

Por que isso existe: hoje a regra de quem recebe o quê está só dentro do n8n.
Quando alguém pergunta "por que este lead foi para o Fulano?", não há onde
olhar. Com estas duas rotas passa a haver um extrato com os dois lados — o que
o Octo respondeu e o que a Lia fez — e eles podem ser comparados.

---

## Como autenticar

```
Authorization: Bearer octo_...
```

É a chave de API da imobiliária (a mesma família de chave que já usam nas
rotas `/api/v1/leads`). Cada imobiliária tem a sua, e é ela que diz ao Octo de
qual casa é a pergunta — **não mandem `tenant_id` no corpo**.

Hoje há chave ativa para Lotus Brokers, Imobiliária Japi e mais três. Se a
chamada voltar `401`, peçam a chave ao Erick; ela se gera em
Configurações › Integrações.

---

## 1. Perguntar de quem é o lead

```
POST https://octodash-octo-dash.fltgo5.easypanel.host/api/v1/distribuicao/destino
Content-Type: application/json
Authorization: Bearer octo_...

{
  "lead_id":       "uuid do lead, se já existir",
  "lead_ref":      "qualquer referência sua, se ainda não houver lead",
  "codigo_imovel": "IM00123",
  "tipo_imovel":   "lancamento | terceiros | recrutamento | vendedores",
  "lia_passou":    true
}
```

Todos os campos são opcionais, mas **quanto menos vocês mandarem, mais genérica
é a resposta**. `codigo_imovel` é o que permite achar o captador; `tipo_imovel`
é o que permite respeitar o dono fixo.

`lia_passou: true` significa "a Lia já falou com este lead". É isso que faz o
cronômetro do bolsão começar a correr.

### A resposta

```json
{
  "success": true,
  "data": {
    "destino":     "corretor",
    "corretor_id": "uuid",
    "motivo":      "roleta_em_ordem",
    "tipo":        "lancamento",
    "prazo_ate":   "2026-09-25T18:40:00.000Z",
    "posicao":     7,
    "registrado":  true
  }
}
```

**`destino` tem três valores, e os três importam:**

| valor | o que fazer |
|---|---|
| `corretor` | Atribuir ao `corretor_id`. O `prazo_ate` é até quando ele tem para atender. |
| `lia` | A Lia atende primeiro. Só depois o lead vai para alguém. |
| `ninguem` | **Não inventem corretor.** A fila inteira está indisponível — pausada, sem permissão ou no limite. Vocês decidem: segurar, avisar o gestor, ou mandar para o bolsão. |

**`registrado: false` quer dizer que a resposta não entrou no extrato.** A
decisão vale, mas ninguém vai conseguir auditá-la depois. Se aparecer muito,
nos avisem.

### Os motivos que podem voltar

| motivo | quer dizer |
|---|---|
| `captador_do_imovel` | O imóvel tem captador e ele está disponível |
| `imovel_sem_captador` | O imóvel é de terceiros e não tem captador cadastrado |
| `captador_indisponivel` | Tem captador, mas ele está pausado / no limite |
| `atendido_pela_lia_primeiro` | A Lia atende antes de passar adiante |
| `roleta_em_ordem` | Rodízio normal — o `posicao` diz em que ponto da fila |
| `nenhum_corretor_disponivel` | Ninguém pode receber agora (vem com `destino: ninguem`) |
| `tipo_tem_dono_fixo` | Recrutamento e "vendedores" não entram no rodízio: têm dono configurado por casa |
| `tipo_sem_dono_configurado` | É um tipo de dono fixo, mas a casa ainda não disse quem é |

Os dois últimos são de 24/09. Na Lotus já estão configurados: recrutamento e
vendedores têm destinatário. Nas outras casas ainda não — lá esse tipo volta
`tipo_sem_dono_configurado`, e a Lia deve tratar como "não sei, segura".

---

## 2. Contar o que a Lia fez

```
POST .../api/v1/distribuicao/evento
Authorization: Bearer octo_...

{
  "evento":      "enviado",
  "motivo":      "corretor notificado no WhatsApp",
  "lead_id":     "uuid",
  "corretor_id": "uuid",
  "prazo_ate":   "2026-09-25T18:40:00.000Z",
  "detalhes":    { "qualquer": "coisa útil" }
}
```

`evento` só aceita: **`enviado`, `atendido`, `expirou`, `roleta`, `bolsao`,
`manual`**. Qualquer outro valor volta `400` com a lista.

**`motivo` é obrigatório e é texto livre.** A rota recusa sem ele de propósito:
a pergunta que o extrato existe para responder é *por quê*, não *o quê*. Um
extrato com "expirou" e nada mais não serve para ninguém.

### Quando chamar

- **`enviado`** — assim que a Lia avisar o corretor.
- **`atendido`** — quando o corretor responder ao lead.
- **`expirou`** — quando o prazo vencer sem resposta.
- **`roleta`** / **`bolsao`** — quando a Lia repassar por um desses caminhos.
- **`manual`** — quando uma pessoa mexeu à mão e furou a regra. **Este é o mais
  importante dos seis**: é o único que mostra onde a regra não está sendo
  seguida, e é o que vai dizer se a regra precisa mudar.

---

## O que NÃO muda

- A Lia continua atribuindo. A rota não escreve em `leads`.
- Se a rota cair ou demorar, **a Lia deve seguir com a regra que ela já tem
  hoje**. Ela não pode parar de distribuir porque o Octo não respondeu — é
  consulta, não autorização.
- Nenhum campo novo nas tabelas da Lia.

## Como conferir que está funcionando

Depois de ligar, a aba **Bolsão › Distribuição** na Dash passa a mostrar o que
aconteceu nas últimas 24 h, atualizando sozinha. Se as consultas estiverem
chegando, elas aparecem lá com o motivo de cada uma. Se a tela seguir vazia,
alguma coisa não está chegando — e aí vale conferir o `registrado` da resposta.
