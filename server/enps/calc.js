// Cálculo oficial de eNPS (Employee Net Promoter Score).
// Funções puras, sem I/O: dirigem eNPS-empresa E eNPS-gestor (uma chamada por pergunta).
//
// Escala das notas 0–10: promotores 9–10, neutros 7–8, detratores 0–6.
// eNPS = %promotores − %detratores (índice −100..+100) NORMALIZADO para 0–10 com
// uma casa decimal: 0 = só detratores, 5 = neutro, 10 = só promotores.
// Sem respostas ⇒ null (não NaN); só neutros ⇒ 5.

export function classify(score) {
  if (score >= 9) return 'promoter';
  if (score >= 7) return 'passive';
  return 'detractor';
}

export function summarize(scores) {
  let promoters = 0;
  let passives = 0;
  let detractors = 0;

  for (const score of scores) {
    const bucket = classify(score);
    if (bucket === 'promoter') promoters += 1;
    else if (bucket === 'passive') passives += 1;
    else detractors += 1;
  }

  const count = scores.length;
  const value = count === 0
    ? null
    : Math.round((((promoters - detractors) / count) * 100 + 100) / 2) / 10;

  return { score: value, enps: value, promoters, passives, detractors, count };
}

export function enps(scores) {
  return summarize(scores).enps;
}
