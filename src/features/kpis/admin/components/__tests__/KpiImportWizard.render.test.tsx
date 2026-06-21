import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => ({ tenantId: 't1', user: { id: 'u1', name: 'Gestor' } }) }));
import { KpiImportWizard } from '../KpiImportWizard';

describe('KpiImportWizard (casca)', () => {
  it('passo inicial mostra a dropzone de arquivo e a trilha de passos', () => {
    render(<KpiImportWizard open onOpenChange={() => {}} existingKpis={[]} />);
    // Trilha de passos (StepRail) com os 4 rótulos — começa no "Arquivo".
    expect(screen.getByText('Arquivo')).toBeInTheDocument();
    expect(screen.getByText('Importar')).toBeInTheDocument();
    // Dropzone: convite a soltar/escolher o arquivo + o input file (oculto).
    expect(screen.getByText(/arraste a planilha aqui/i)).toBeInTheDocument();
    expect(document.querySelector('input[type=file]')).toBeTruthy();
  });
});
