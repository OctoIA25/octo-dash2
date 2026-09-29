/**
 * Conteúdo puro do card do Kanban de candidatos: nome, canal, cargo, "há N
 * dias", as três bolinhas das condições, coordenador e o link do WhatsApp — que
 * não abre a ficha ao ser clicado.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecrutamentoKanbanCardContent, type CandidatoKanban } from './RecrutamentoKanbanCard';
import { textoHaDias } from '../domain/recruitmentStages';

function fazCandidato(extra: Partial<CandidatoKanban> = {}): CandidatoKanban {
  return {
    id: 'c1',
    nome: 'Ana Silva',
    estagio: 'interacao',
    status: 'Interação',
    telefone: '(11) 98888-7777',
    fonte: 'Meta',
    cargo: 'Corretor Júnior',
    ts_candidatura: '2026-09-26T12:00:00Z',
    cond_regiao: 'aprovado',
    cond_tempo: 'pendente',
    cond_verba: 'reprovado',
    ...extra,
  };
}

describe('RecrutamentoKanbanCardContent', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-29T15:00:00Z'));
  });
  afterAll(() => vi.useRealTimers());

  it('mostra nome, canal, cargo e há quantos dias se candidatou', () => {
    render(<RecrutamentoKanbanCardContent candidato={fazCandidato()} onAbrir={() => {}} />);
    expect(screen.getByText('Ana Silva')).toBeInTheDocument();
    expect(screen.getByText('Meta')).toBeInTheDocument();
    expect(screen.getByText('Corretor Júnior')).toBeInTheDocument();
    expect(screen.getByText('há 3 dias')).toBeInTheDocument();
  });

  it('textoHaDias: hoje, 1 dia, N dias', () => {
    expect(textoHaDias(0)).toBe('hoje');
    expect(textoHaDias(1)).toBe('há 1 dia');
    expect(textoHaDias(12)).toBe('há 12 dias');
  });

  it('link do WhatsApp com o número canônico, e clicar nele NÃO abre a ficha', () => {
    const onAbrir = vi.fn();
    render(<RecrutamentoKanbanCardContent candidato={fazCandidato()} onAbrir={onAbrir} />);
    const link = screen.getByRole('link', { name: /whatsapp/i });
    expect(link).toHaveAttribute('href', 'https://wa.me/5511988887777');
    fireEvent.click(link);
    expect(onAbrir).not.toHaveBeenCalled();
  });

  it('clicar no corpo abre a ficha', () => {
    const onAbrir = vi.fn();
    const c = fazCandidato();
    render(<RecrutamentoKanbanCardContent candidato={c} onAbrir={onAbrir} />);
    fireEvent.click(screen.getByText('Ana Silva'));
    expect(onAbrir).toHaveBeenCalledWith(c);
  });

  it('sem telefone válido: sem link', () => {
    render(<RecrutamentoKanbanCardContent candidato={fazCandidato({ telefone: '1234' })} onAbrir={() => {}} />);
    expect(screen.queryByRole('link', { name: /whatsapp/i })).toBeNull();
  });

  it('três bolinhas das condições, cada uma com sua situação', () => {
    render(<RecrutamentoKanbanCardContent candidato={fazCandidato()} onAbrir={() => {}} />);
    expect(screen.getByTitle('Região: Aprovado')).toBeInTheDocument();
    expect(screen.getByTitle('Tempo: Pendente')).toBeInTheDocument();
    expect(screen.getByTitle('Verba: Reprovado')).toBeInTheDocument();
  });

  it('coordenador aparece quando há; área substitui cargo quando não há cargo', () => {
    render(
      <RecrutamentoKanbanCardContent
        candidato={fazCandidato({ cargo: undefined, area: 'Lançamentos', coordenador_id: 'u1' })}
        coordenadorNome="fabio@lotus.com"
        onAbrir={() => {}}
      />,
    );
    expect(screen.getByText('Lançamentos')).toBeInTheDocument();
    expect(screen.getByText(/fabio@lotus.com/)).toBeInTheDocument();
  });
});
