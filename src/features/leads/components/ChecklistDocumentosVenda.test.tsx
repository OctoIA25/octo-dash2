import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChecklistDocumentosVenda } from './ChecklistDocumentosVenda';

const renderChecklist = (valores: Record<string, string> = {}) => {
  const onAlternar = vi.fn();
  render(<ChecklistDocumentosVenda valores={valores} onAlternar={onAlternar} />);
  return { onAlternar };
};

describe('ChecklistDocumentosVenda', () => {
  it('mostra os quatro blocos do checklist com seus itens', () => {
    renderChecklist();

    expect(screen.getByText('Documentos do Imóvel')).toBeInTheDocument();
    expect(screen.getByText('Documentos do Vendedor (Pessoa Física)')).toBeInTheDocument();
    expect(screen.getByText('Se o Vendedor for Pessoa Jurídica (Empresa)')).toBeInTheDocument();
    expect(screen.getByText('Quando a Compra for Financiada')).toBeInTheDocument();

    expect(screen.getByText('Matrícula atualizada do imóvel')).toBeInTheDocument();
    expect(screen.getByText('Certidão dos Cartórios de Protesto')).toBeInTheDocument();
    expect(screen.getByText('Cartão do CNPJ')).toBeInTheDocument();
    expect(screen.getByText('Certidões emitidas há menos de 30 dias')).toBeInTheDocument();
  });

  it('os 9 sites de certidão são https e abrem em nova aba sem expor a página', () => {
    renderChecklist();

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(9);
    for (const link of links) {
      expect(link.getAttribute('href')).toMatch(/^https:\/\//);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    }
  });

  it('IPTU aparece sem link: depende da prefeitura de cada imóvel', () => {
    renderChecklist();

    expect(screen.getByText('Prefeitura Municipal onde o imóvel está localizado')).toBeInTheDocument();
  });

  it('sem nada salvo, tudo começa desmarcado e cada bloco conta zero', () => {
    renderChecklist();

    for (const caixa of screen.getAllByRole('checkbox')) expect(caixa).not.toBeChecked();
    expect(screen.getByText('0 de 7')).toBeInTheDocument(); // Imóvel
    expect(screen.getByText('0 de 11')).toBeInTheDocument(); // Vendedor PF
  });

  it('marcar avisa a chave do item e a descrição para o histórico', async () => {
    const { onAlternar } = renderChecklist();

    await userEvent.click(screen.getByRole('checkbox', { name: 'CPF (Vendedor PF)' }));

    expect(onAlternar).toHaveBeenCalledWith('doc:vendedor_pf:cpf', true, 'CPF (Vendedor PF)');
  });

  it('item salvo aparece marcado, entra na contagem e desmarcar avisa false', async () => {
    const { onAlternar } = renderChecklist({ 'doc:vendedor_pf:cpf': '2026-09-18T15:00:00.000Z' });

    const cpf = screen.getByRole('checkbox', { name: 'CPF (Vendedor PF)' });
    expect(cpf).toBeChecked();
    expect(screen.getByText('1 de 11')).toBeInTheDocument();

    await userEvent.click(cpf);
    expect(onAlternar).toHaveBeenCalledWith('doc:vendedor_pf:cpf', false, 'CPF (Vendedor PF)');
  });

  it('o mesmo documento de PF e de PJ marca separado', () => {
    renderChecklist({ 'doc:vendedor_pf:certidao_justica_federal': '2026-09-18T15:00:00.000Z' });

    expect(screen.getByRole('checkbox', { name: 'Certidão da Justiça Federal (Vendedor PF)' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Certidão da Justiça Federal (Vendedor PJ)' })).not.toBeChecked();
  });
});
