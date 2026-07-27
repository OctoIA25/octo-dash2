// Cálculo oficial de eNPS (Employee Net Promoter Score).
// Funções puras, sem I/O: dirigem eNPS-empresa E eNPS-gestor (uma chamada por pergunta).
//
// Escala 0–10: promotores 9–10, neutros 7–8, detratores 0–6.
// eNPS = %promotores − %detratores. Sem respostas ⇒ null (não NaN); só neutros ⇒ 0.

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
    : Math.round((promoters / count) * 100 - (detractors / count) * 100);

  return { score: value, enps: value, promoters, passives, detractors, count };
}

export function enps(scores) {
  return summarize(scores).enps;
}
