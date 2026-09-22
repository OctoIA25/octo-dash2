/**
 * O simulador da distribuição.
 *
 * Ele existe para responder "de quem seria este lead" ANTES de o lead existir,
 * e para mostrar a coisa que um lead de cada vez não mostra: que a roleta é
 * RODÍZIO. Estes testes travam justamente o que a tela precisa provar ao
 * gestor — inclusive que ela roda a MESMA regra do servidor, e não uma cópia
 * que concorda por acaso.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SimuladorDistribuicao } from '../SimuladorDistribuicao';
import type { ParticipanteDaRoleta } from '../regraDoServidor';

// O Select do Radix usa três APIs de ponteiro/rolagem que o jsdom não
// implementa. Sem estes remendos o menu nunca abre e o teste falharia por um
// motivo que não é o do produto.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

const p = (id: string, nome: string, extra: Partial<ParticipanteDaRoleta> = {}): ParticipanteDaRoleta => ({
  id, nome, ...extra,
});

const FILA = [p('1', 'Ana'), p('2', 'Bruno'), p('3', 'Carla')];

const montar = (props: Partial<React.ComponentProps<typeof SimuladorDistribuicao>> = {}) =>
  render(
    <SimuladorDistribuicao
      participantes={FILA}
      horarioFuncionamento={{}}
      configPrazo={{ tempo_expiracao_exclusivo: 60 }}
      {...props}
    />
  );

const linhas = () => screen.getAllByRole('row').slice(1); // sem o cabeçalho
const simular = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /Simular/ }));

/**
 * Marca "A Lia já passou o lead" e simula.
 *
 * Desde 22/09 TODO lead espera a Lia — sem este clique, a tela responde "a Lia
 * atende primeiro" e nenhum corretor aparece. Os casos que testam a roleta e o
 * captador falam do DEPOIS do handoff, e agora precisam dizer isso.
 */
const simularDepoisDaLia = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByLabelText(/A Lia já passou o lead/));
  await simular(user);
};

describe('o simulador não encosta em lead nenhum', () => {
  it('diz isso na tela, para não restar dúvida', () => {
    montar();
    expect(screen.getByText(/Não atribui nada/)).toBeInTheDocument();
  });
});

describe('a roleta é rodízio — é isso que a sequência mostra', () => {
  it('cada lead vai para o próximo da fila, e ela dá a volta', async () => {
    const user = userEvent.setup();
    montar();
    fireEvent.change(screen.getByLabelText('Quantos leads'), { target: { value: '4' } });
    await simularDepoisDaLia(user);

    const nomes = linhas().map((l) => within(l).getAllByRole('cell')[1].textContent);
    expect(nomes).toEqual(['Ana', 'Bruno', 'Carla', 'Ana']);
  });

  it('quem está pausado é PULADO e mantém a vez', async () => {
    const user = userEvent.setup();
    montar({ participantes: [p('1', 'Ana'), p('2', 'Bruno', { pausado: true }), p('3', 'Carla')] });
    await simularDepoisDaLia(user);

    const nomes = linhas().map((l) => within(l).getAllByRole('cell')[1].textContent);
    expect(nomes).not.toContain('Bruno');
    expect(nomes.slice(0, 2)).toEqual(['Ana', 'Carla']);
  });

  it('a simulação começa de ONDE A FILA ESTÁ, não do começo', async () => {
    // Um gestor que vê "o próximo é a Carla" precisa que a tela concorde.
    const user = userEvent.setup();
    montar({ ponteiro: { posicao: 1, corretorId: '2' } });
    await simularDepoisDaLia(user);
    expect(within(linhas()[0]).getAllByRole('cell')[1]).toHaveTextContent('Carla');
  });
});

describe('as regras decididas em 19/09 aparecem na tela', () => {
  it('imóvel COM captador vai para ele, lead após lead', async () => {
    const user = userEvent.setup();
    montar();
    // O último seletor da linha é o de captador (tipo, código, captador).
    const seletores = screen.getAllByRole('combobox');
    await user.click(seletores[seletores.length - 1]);
    await user.click(await screen.findByRole('option', { name: 'Ana' }));
    await simularDepoisDaLia(user);

    const primeira = within(linhas()[0]).getAllByRole('cell');
    expect(primeira[1]).toHaveTextContent('Ana');
    expect(primeira[2]).toHaveTextContent(/captador do imóvel/);
    // Todos os leads deste imóvel vão para o mesmo captador.
    // (Que o captador não gasta a vez de ninguém é garantia da REGRA, e está
    //  afirmada em server/distribuicao/regra.test.js — aqui não dá para
    //  distinguir os dois casos pela tela.)
    expect(within(linhas()[1]).getAllByRole('cell')[1]).toHaveTextContent('Ana');
  });

  it('CAPTADOR PAUSADO cai na roleta — a tela não pode prometer o que não acontece', async () => {
    // O simulador mandava `{ id }` puro para a regra, sem as flags, e então
    // `podeReceber` dizia sempre que sim: a tela mostrava o captador pausado
    // recebendo um lead que na prática vai para a roleta.
    const user = userEvent.setup();
    montar({ participantes: [p('1', 'Ana'), p('2', 'Bruno')], equipe: [p('1', 'Ana'), p('2', 'Bruno'), p('9', 'Dora', { pausado: true })] });
    const seletores = screen.getAllByRole('combobox');
    await user.click(seletores[seletores.length - 1]);
    await user.click(await screen.findByRole('option', { name: /Dora/ }));
    await simularDepoisDaLia(user);

    const primeira = within(linhas()[0]).getAllByRole('cell');
    expect(primeira[1]).not.toHaveTextContent('Dora');
    expect(primeira[2]).toHaveTextContent(/captador indisponível/);
  });

  it('o captador pode estar FORA do rodízio e ainda assim receber', async () => {
    // 15 dos 22 imóveis com captador da Lotus estão neste caso (20/09/2026):
    // listar só o rodízio esconderia esses imóveis do gestor.
    const user = userEvent.setup();
    montar({ participantes: [p('1', 'Ana')], equipe: [p('1', 'Ana'), p('9', 'Dora')] });
    const seletores = screen.getAllByRole('combobox');
    await user.click(seletores[seletores.length - 1]);
    await user.click(await screen.findByRole('option', { name: 'Dora' }));
    await simularDepoisDaLia(user);

    const primeira = within(linhas()[0]).getAllByRole('cell');
    expect(primeira[1]).toHaveTextContent('Dora');
    expect(primeira[2]).toHaveTextContent(/captador do imóvel/);
  });

  it('lançamento vai para a Lia antes de ela passar, e sem prazo', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getAllByRole('combobox')[0]);
    await user.click(await screen.findByRole('option', { name: 'Lançamento' }));
    await simular(user);

    const celulas = within(linhas()[0]).getAllByRole('cell');
    expect(celulas[1]).toHaveTextContent('A Lia');
    expect(celulas[2]).toHaveTextContent(/a Lia atende primeiro/);
    expect(celulas[3]).toHaveTextContent('—');
  });

  it('fila vazia avisa em vez de mostrar tabela vazia', () => {
    montar({ participantes: [] });
    expect(screen.getByText(/Nenhum corretor na roleta/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Simular/ })).toBeDisabled();
  });
});

describe('o prazo vem da mesma conta do servidor', () => {
  it('os 525.600 minutos da Lotus caem no padrão de 60', () => {
    montar({ configPrazo: { tempo_expiracao_exclusivo: 525600 } });
    expect(screen.getByText(/prazo: 60 min de expediente/)).toBeInTheDocument();
  });

  it('um prazo razoável da imobiliária é respeitado', () => {
    montar({ configPrazo: { tempo_expiracao_exclusivo: 30 } });
    expect(screen.getByText(/prazo: 30 min de expediente/)).toBeInTheDocument();
  });
});
