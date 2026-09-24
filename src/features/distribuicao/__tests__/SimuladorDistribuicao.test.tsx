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
    expect(screen.getByText(/não atribui nada/i)).toBeInTheDocument();
  });

  // 24/09, pedido do chefe: "explicar melhor que o botão serve pra mostrar
  // para quem a Lia passaria, afinal sempre passa pela mão dela". A frase
  // antiga era "se este lead chegasse agora, de quem seria?" — dava a
  // entender que o Octo distribui, e ele não distribui desde 19/09.
  it('diz que a Lia vem antes, e que o botão mostra PARA QUEM ela passaria', () => {
    montar();
    expect(screen.getByText(/Todo lead passa pela Lia primeiro/i)).toBeInTheDocument();
    expect(screen.getByText(/para quem a Lia passaria este lead/i)).toBeInTheDocument();
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
  /*
   * OS TRÊS TESTES DO CAMPO DE CAPTADOR SAÍRAM EM 24/09.
   *
   * Eles dirigiam a tela pelo seletor de captador, e o chefe pediu para tirar
   * esse campo: "só tirar a parte onde preenchemos o captador". Sem o campo,
   * não há como escolher um captador pela tela, e os testes não tinham mais
   * caminho para percorrer.
   *
   * O COMPORTAMENTO NÃO FICOU DESCOBERTO. As três coisas que eles afirmavam
   * continuam verdadeiras na REGRA, e lá continuam testadas, em
   * `server/distribuicao/regra.test.js`:
   *
   *   - 'depois que a Lia passa, vai para o captador do imóvel'
   *   - 'captador pausado NÃO segura o lead: ele vai para a roleta'
   *   - 'o captador NÃO consome a vez da roleta'
   *
   * O que sumiu foi a porta da tela, não a regra.
   */
  it('sem o campo de captador, a tela avisa qual caminho está mostrando', () => {
    montar();
    // O tipo padrão é "terceiros", e a nota precisa estar visível logo de cara.
    expect(screen.getByText(/sem captador cadastrado/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Captador$/)).not.toBeInTheDocument();
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

/**
 * Os dois tipos que o chefe pediu em 24/09 (item 1 da lista dele):
 * recrutamento vem para ele, vendedor vai para a gestora de terceiros.
 *
 * O caso do "sem dono configurado" é o que sustenta este bloco: se o tipo
 * cair na roleta por omissão, o lead de recrutamento volta a ser distribuído
 * a um corretor de plantão — que é exatamente o que ele mandou parar de
 * acontecer, e voltaria calado.
 */
describe('os tipos com dono fixo', () => {
  const escolherTipo = async (user: ReturnType<typeof userEvent.setup>, nome: RegExp) => {
    await user.click(screen.getAllByRole('combobox')[0]);
    await user.click(await screen.findByRole('option', { name: nome }));
  };

  it('recrutamento vai para quem está configurado, e não para a fila', async () => {
    const user = userEvent.setup();
    montar({
      participantes: [p('1', 'Ana'), p('2', 'Bruno')],
      equipe: [p('1', 'Ana'), p('2', 'Bruno'), p('9', 'Erick')],
      destinoPorTipo: { recrutamento: '9', vendedores: '1' },
    });
    await escolherTipo(user, /Recrutamento/);
    await simularDepoisDaLia(user);

    const primeira = within(linhas()[0]).getAllByRole('cell');
    expect(primeira[1]).toHaveTextContent('Erick');
    expect(primeira[2]).toHaveTextContent(/dono fixo/i);
  });

  it('vendedor vai para a gestora de terceiros', async () => {
    const user = userEvent.setup();
    montar({
      participantes: [p('1', 'Ana')],
      equipe: [p('1', 'Ana'), p('7', 'Mariana')],
      destinoPorTipo: { vendedores: '7' },
    });
    await escolherTipo(user, /Vendedor/);
    await simularDepoisDaLia(user);
    expect(within(linhas()[0]).getAllByRole('cell')[1]).toHaveTextContent('Mariana');
  });

  it('SEM dono configurado NÃO cai na roleta — a tela diz que falta configurar', async () => {
    const user = userEvent.setup();
    montar({ participantes: [p('1', 'Ana'), p('2', 'Bruno')], destinoPorTipo: null });
    await escolherTipo(user, /Recrutamento/);
    await simularDepoisDaLia(user);

    const primeira = within(linhas()[0]).getAllByRole('cell');
    expect(primeira[1]).toHaveTextContent(/Ningu[ée]m/i);
    expect(primeira[1]).not.toHaveTextContent('Ana');
    expect(primeira[2]).toHaveTextContent(/falta dizer quem recebe/i);
  });

  it('a tela explica que o tipo não entra no rodízio', async () => {
    const user = userEvent.setup();
    montar({ destinoPorTipo: { recrutamento: '9' } });
    await escolherTipo(user, /Recrutamento/);
    expect(screen.getByText(/não entra no rodízio/i)).toBeInTheDocument();
  });
});
