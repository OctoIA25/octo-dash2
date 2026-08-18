-- Migration: manter imoveis_locais.updated_at
-- Data: 2026-08-17
-- Descrição: a coluna existe desde 20260304 mas só tinha DEFAULT NOW() — nenhum
-- caller (CriarImovelForm, aprovação em MeusImoveisTab, api-server,
-- proxy-production) mandava o campo, então `updated_at` era na prática a data de
-- criação. A regra "3 meses sem ajuste = desatualizado" depende dele, e o trigger
-- resolve no banco em vez de espalhar `updated_at: new Date()` por cada caller,
-- presentes e futuros. O upsert do formulário (INSERT ... ON CONFLICT DO UPDATE)
-- também dispara o BEFORE UPDATE.

-- Função própria (não a genérica update_updated_at_column, compartilhada com as
-- tabelas de recrutamento) por causa da escapatória: quando o caller MANDA
-- updated_at explicitamente, o valor dele vence. É assim que o reprocessamento de
-- marca d'água regrava `fotos` em lote sem zerar o relógio de todos os imóveis —
-- ele reenvia o updated_at antigo. Mesma ideia do `IS NOT DISTINCT FROM` usado no
-- tg_guard_captador.
CREATE OR REPLACE FUNCTION touch_imoveis_locais_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_imoveis_locais_updated_at ON imoveis_locais;
CREATE TRIGGER update_imoveis_locais_updated_at
  BEFORE UPDATE ON imoveis_locais
  FOR EACH ROW EXECUTE FUNCTION touch_imoveis_locais_updated_at();
