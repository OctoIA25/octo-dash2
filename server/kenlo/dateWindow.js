/**
 * Calcula o startDate (YYYY-MM-DD) enviado à API do Kenlo conforme o modo.
 * Puro e testável: `now` injetável. A API filtra por DATA DE CRIAÇÃO (ver spec,
 * seção "Premissas e Limitações da API do Kenlo").
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const toYMD = (ms) => new Date(ms).toISOString().slice(0, 10);

export function resolveStartDate({ syncMode, lastSyncAt, cfg, now = Date.now }) {
  const historical = () => toYMD(now() - cfg.syncWindowDays * DAY_MS);
  if (syncMode === 'LIVE' && lastSyncAt) {
    return toYMD(Date.parse(lastSyncAt) - cfg.syncOverlapMin * 60 * 1000);
  }
  return historical(); // BACKFILL ou LIVE sem cursor → janela histórica
}
