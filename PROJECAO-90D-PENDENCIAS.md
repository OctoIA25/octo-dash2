# Projeção 90 dias — o que falta (03/10/2026)

Código pronto na branch `projecao-90d` (worktree `octo-dash2-projecao`). **Nada foi para produção.**
Testado no Supabase local e no navegador com contas descartáveis (Diretoria e Gerente).

## Para você (OK de produção, nesta ordem)
1. Aplicar as migrations 20261025 → 20261026 → 20261027 → 20261028 **antes** do push (a tela nova chama as funções novas).
2. Rodar `scripts/projecao-90d/1-carga-ponte-planilha.sql`. Medido: 29 linhas ligam nas vendas do CRM, 2 viram venda
   (Angelo Finati, 30/01, R$ 66.250; parceria de 29/04, R$ 9.870 — as duas já recebidas), 6 ficam de fora.
   O DRE (competência) de janeiro e abril sobe esses valores; no caixa, os R$ 66.250 entram de uma vez em 31/07
   (data da última parcela) e os R$ 9.870 em 30/04.
   ⚠️ Depois da migration 20261027, a primeira releitura da planilha que der certo já faz essa carga sozinha.
   Hoje isso não acontece porque o arquivo dá 410.
3. Rodar `scripts/projecao-90d/2-classificar-custos.sql` (46 de Marketing, 45 de Salários). Sem ele, Marketing e provisões saem zerados.
4. Push da branch → deploy no EasyPanel.
5. Link novo da planilha de vendas: o arquivo atual dá 410 desde 01/09; setembro não entra sem ele.
   Ao trocar o link, desativar antes as linhas da planilha antiga (o importador não faz isso): senão cada linha
   relida aparece "sem par" e a aba Planilha dobra.

## Para a Lotus (na tela, sem código)
- Financeiro → Projeção 90 dias → "Informar o saldo" da conta Inter (o padrão é o fim de ontem).
- Conferência → pôr a data prevista nas 6 vendas em aberto (R$ 193 mil, hoje todas em "Atrasado / sem data").

## Para o Erick
- O Gerente vê e edita **todas** as vendas da casa, não só as da equipe dele. É isso?
- Provisões = 19,44% da folha. Quem é PJ/estágio não tem 13º nem férias: tirar alguém da conta?
