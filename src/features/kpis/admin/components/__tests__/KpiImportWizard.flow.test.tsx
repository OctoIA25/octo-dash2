import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => ({ tenantId: 't1', user: { id: 'u1', name: 'Gestor' } }) }));
const persistSpy = vi.fn().mockResolvedValue({ creates: [], updates: [{ kpiName: 'X', periodStart: '2026-01-01', value: 1 }], conflicts: [], ignored: [] });
vi.mock('@/features/kpis/admin/services/kpiImportService', () => ({ persistImport: (...a: unknown[]) => persistSpy(...a) }));
vi.mock('@/features/relatorios/import/generic/services/genericImportService', () => ({
  GenericImportService: { readGenericTable: vi.fn().mockResolvedValue({ sheetName: 'Metas', totalRows: 1, truncated: false,
    columns: [{ name: 'KPI', label: 'KPI', index: 0 }, { name: 'Jan/2026', label: 'Jan/2026', index: 1 }],
    rows: [{ KPI: 'X', 'Jan/2026': '1' }] }) },
}));

import { KpiImportWizard } from '../KpiImportWizard';

describe('KpiImportWizard fluxo (14c)', () => {
  it('dry-run chama persistImport com dryRun:true e NÃO grava (sem confirmar)', async () => {
    render(<KpiImportWizard open onOpenChange={() => {}} existingKpis={[]} />);
    // upload → handleFile lê a planilha (a "análise" acontece aqui) e vai p/ 'preview'.
    const file = new File(['x'], 'metas.xlsx');
    fireEvent.change(document.querySelector('input[type=file]')!, { target: { files: [file] } });
    // O preview (passo "Conferir") mostra o nome do arquivo + a contagem de "linhas".
    await waitFor(() => expect(screen.getByText('metas.xlsx')).toBeInTheDocument());
    expect(screen.getByText('linhas')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /avançar/i }));        // preview → mapeamento
    fireEvent.click(screen.getByRole('button', { name: /pré-visualizar/i })); // mapeamento → dry-run
    await waitFor(() => expect(persistSpy).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true, preview: expect.any(Object) })));
    // Sem clicar "Confirmar", NADA é gravado: persistImport nunca é chamado com dryRun:false.
    expect(persistSpy).not.toHaveBeenCalledWith(expect.objectContaining({ dryRun: false }));
  });

  it('ao CONFIRMAR, grava (dryRun:false) e dispara onImported (revalida sem F5)', async () => {
    const onImported = vi.fn();
    const onOpenChange = vi.fn();
    render(<KpiImportWizard open onOpenChange={onOpenChange} existingKpis={[]} onImported={onImported} />);
    fireEvent.change(document.querySelector('input[type=file]')!, { target: { files: [new File(['x'], 'metas.xlsx')] } });
    await waitFor(() => expect(screen.getByText('metas.xlsx')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /avançar/i }));
    fireEvent.click(screen.getByRole('button', { name: /pré-visualizar/i }));
    await screen.findByRole('button', { name: /confirmar importação/i });
    fireEvent.click(screen.getByRole('button', { name: /confirmar importação/i }));

    await waitFor(() => expect(persistSpy).toHaveBeenCalledWith(expect.objectContaining({ dryRun: false })));
    // A lista deve revalidar (onImported) e o diálogo fechar.
    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
