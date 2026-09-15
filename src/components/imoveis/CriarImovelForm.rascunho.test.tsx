/**
 * Autosave do rascunho (RF-14): 5 s depois da última alteração, um save por
 * vez, e edição feita durante o save continua pendente (o snapshot salvo não
 * limpa o que chegou depois). Se outra tela publicou o imóvel, o update
 * condicional não casa linha nenhuma e o autosave para em vez de rebaixar.
 * Publicar o rascunho usa o mesmo update condicional e atribui o imóvel ao autor.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { buildEditDataFromLocal } from '@/features/imoveis/utils/buildEditDataFromLocal';

type Escrita = { tabela: string; op: string; payload: Record<string, unknown>; filtros: Record<string, unknown> };
type Resposta = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({
  escritas: [] as Escrita[],
  responder: (_e: Escrita): Promise<Resposta> => Promise.resolve({ data: [{ updated_at: '2026-09-14T13:10:00Z' }], error: null }),
  auth: {
    user: { id: 'u1', name: 'Ana', email: 'ana@x.com', tenantId: 't1', systemRole: 'admin' },
    tenantId: 't1',
  },
  uploads: [] as Array<Array<{ url: string }>>,
  // Resposta dos .maybeSingle() por tabela (checagem de código, contato do autor).
  unico: {} as Record<string, unknown>,
  // O que a RPC imoveis_proprietarios devolve (null = usuário sem permissão).
  proprietario: null as Record<string, unknown> | null,
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => h.auth }));
vi.mock('@/features/imoveis/hooks/useCaptadores', () => ({
  useCaptadores: () => ({ data: [{ user_id: 'u1', nome: 'Ana' }] }),
}));

vi.mock('@/lib/supabaseClient', () => {
  const from = (tabela: string) => {
    const e: Escrita = { tabela, op: 'select', payload: {}, filtros: {} };
    const self: Record<string, unknown> = {};
    Object.assign(self, {
      select: () => self,
      order: () => self,
      ilike: () => self,
      limit: () => self,
      eq: (k: string, v: unknown) => { e.filtros[k] = v; return self; },
      update: (p: Record<string, unknown>) => { Object.assign(e, { op: 'update', payload: p }); return self; },
      upsert: (p: Record<string, unknown>) => { Object.assign(e, { op: 'upsert', payload: p }); return self; },
      insert: (p: Record<string, unknown>) => { Object.assign(e, { op: 'insert', payload: p }); return self; },
      maybeSingle: () => Promise.resolve({ data: h.unico[tabela] ?? null, error: null }),
      then: (ok: (v: Resposta) => unknown, err: (r: unknown) => unknown) => {
        if (e.op === 'select') return Promise.resolve({ data: [], error: null }).then(ok, err);
        h.escritas.push(e);
        return h.responder(e).then(ok, err);
      },
    });
    return self;
  };
  return { supabase: { from } };
});

vi.mock('@/lib/uploadImoveisFotos', () => ({
  // Foto em base64 "sobe" e volta como URL — a mesma troca que o pipeline real faz.
  uploadImoveisFotos: vi.fn(async ({ fotos }: { fotos: Array<{ url: string }> }) => {
    h.uploads.push(fotos);
    return fotos.map((f) => (f.url.startsWith('data:') ? { ...f, url: 'https://cdn/foto.jpg', id: 'p1' } : f));
  }),
}));
vi.mock('@/lib/watermarkUpload', () => ({ watermarkPhotoUrl: (id: string) => `https://wm/${id}` }));
vi.mock('@/features/agentes-ia/services/agentWebhookService', () => ({ sendMessageToAgent: vi.fn() }));
vi.mock('@/features/imoveis/services/proprietarioService', () => ({
  verificarImovelDuplicado: vi.fn(async () => []),
  buscarProprietarioDoImovel: vi.fn(async () => h.proprietario),
}));
vi.mock('@/features/imoveis/services/rascunhosService', () => ({ excluirRascunho: vi.fn() }));
vi.mock('./ImovelHistorico', () => ({ ImovelHistorico: () => null }));
vi.mock('./ProprietarioAutocomplete', () => ({ ProprietarioAutocomplete: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { CriarImovelForm } = await import('./CriarImovelForm');

const rascunho = buildEditDataFromLocal({
  codigo_imovel: 'AP0001',
  tipo: 'Apartamento',
  status_aprovacao: 'rascunho',
  updated_at: '2026-09-14T13:00:00Z',
  captador_id: 'u1',
  fotos: [{ url: 'data:image/jpeg;base64,AAA', legenda: '', isCapa: true }],
});

// Rascunho completo o bastante para publicar (validarPublicacaoImovel passa). O
// proprietário não vem na linha (sem SELECT no banco): chega pela RPC (h.proprietario).
const rascunhoCompleto = buildEditDataFromLocal({
  codigo_imovel: 'AP0001',
  tipo: 'Apartamento',
  status_aprovacao: 'rascunho',
  updated_at: '2026-09-14T13:00:00Z',
  captador_id: 'u1',
  criado_por: 'u1',
  cep: '13201-000',
  logradouro: 'Rua Barão',
  numero: '10',
  bairro: 'Centro',
  cidade: 'Jundiaí',
});

const DONO = {
  codigo_imovel: 'AP0001',
  proprietario_nome: 'Carlos Dono',
  proprietario_telefone: '(11) 97777-6666',
  proprietario_tel_residencial: null,
  proprietario_tel_comercial: null,
  proprietario_email: 'carlos@x.com',
};

const avancar = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const updates = () => h.escritas.filter((e) => e.tabela === 'imoveis_locais');

const abrir = async (initialData = rascunho, onClose = vi.fn()) => {
  await act(async () => {
    render(<CriarImovelForm isOpen onClose={onClose} onSuccess={vi.fn()} initialData={initialData} isEdit />);
  });
  fireEvent.click(screen.getByText('Publicação na Web'));
  return onClose;
};

const digitarTitulo = (valor: string) =>
  fireEvent.change(screen.getByPlaceholderText('Ex: Casa 3 quartos no Jardim Europa'), { target: { value: valor } });

describe('CriarImovelForm — rascunho', () => {
  beforeEach(() => {
    // A validação da publicação rola até a seção com problema; o jsdom não implementa scroll.
    Element.prototype.scrollIntoView = vi.fn();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    h.escritas = [];
    h.uploads = [];
    h.unico = {};
    h.proprietario = DONO;
    h.responder = () => Promise.resolve({ data: [{ updated_at: '2026-09-14T13:10:00Z' }], error: null });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('salva 5 s depois da última alteração, com update condicional ao status rascunho', async () => {
    await abrir();
    expect(screen.getByText('Rascunho de imóvel')).toBeInTheDocument();

    digitarTitulo('Novo título');
    await avancar(4999);
    expect(updates()).toHaveLength(0);
    await avancar(1);

    expect(updates()).toHaveLength(1);
    const [e] = updates();
    expect(e.op).toBe('update');
    expect(e.filtros).toMatchObject({ tenant_id: 't1', codigo_imovel: 'AP0001', status_aprovacao: 'rascunho' });
    expect(e.payload).toMatchObject({ titulo: 'Novo título', status_aprovacao: 'rascunho' });
    expect(e.payload).not.toHaveProperty('criado_por');
    // Nenhuma atribuição em imoveis_corretores enquanto for rascunho.
    expect(h.escritas.some((x) => x.tabela === 'imoveis_corretores')).toBe(false);
    expect(screen.getByText(/Salvo automaticamente às/)).toBeInTheDocument();

    // Salvo e sem alteração nova: não salva de novo.
    await avancar(20000);
    expect(updates()).toHaveLength(1);
  });

  it('um save por vez; o que foi editado durante o save é salvo depois, sem re-subir fotos', async () => {
    let concluir: (r: Resposta) => void = () => {};
    h.responder = () => new Promise<Resposta>((ok) => { concluir = ok; });
    await abrir();

    digitarTitulo('Primeiro');
    await avancar(5000);
    expect(updates()).toHaveLength(1);

    digitarTitulo('Segundo');
    await avancar(20000);
    expect(updates()).toHaveLength(1);

    await act(async () => concluir({ data: [{ updated_at: '2026-09-14T13:10:00Z' }], error: null }));
    await avancar(5000);

    expect(updates()).toHaveLength(2);
    expect(updates()[1].payload.titulo).toBe('Segundo');
    // A foto em base64 subiu no primeiro save e voltou ao formulário como URL.
    expect(h.uploads[0][0].url).toMatch(/^data:/);
    expect(h.uploads[1][0].url).toBe('https://cdn/foto.jpg');
  });

  it('se a linha deixou de ser rascunho, avisa e para o autosave', async () => {
    h.responder = () => Promise.resolve({ data: [], error: null });
    await abrir();

    digitarTitulo('Editado aqui');
    await avancar(5000);
    expect(screen.getByText(/não é mais um rascunho/)).toBeInTheDocument();

    digitarTitulo('Editado de novo');
    await avancar(20000);
    expect(updates()).toHaveLength(1);
  });

  it('fechar com alteração pendente pede confirmação', async () => {
    const onClose = await abrir();
    digitarTitulo('Não salvo');

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(screen.getByText(/Existem alterações que ainda não foram salvas/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Sair sem salvar'));
    expect(onClose).toHaveBeenCalled();
  });

  it('publicar rascunho que outra tela publicou/excluiu não grava nada e trava os botões', async () => {
    h.responder = (e) => Promise.resolve({ data: e.tabela === 'imoveis_locais' ? [] : null, error: null });
    await abrir(rascunhoCompleto);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /publicar imóvel/i })); });

    const [e] = updates();
    // Update condicional (nunca upsert): aprovado/excluído não casa e não volta a "aguardando".
    expect(e.op).toBe('update');
    expect(e.filtros).toMatchObject({ codigo_imovel: 'AP0001', status_aprovacao: 'rascunho' });
    expect(e.payload).toMatchObject({ status_aprovacao: 'aguardando' });
    expect(screen.getByText(/não é mais um rascunho/)).toBeInTheDocument();
    expect(h.escritas.some((x) => x.tabela === 'imoveis_corretores')).toBe(false);
    expect(screen.getByRole('button', { name: /publicar imóvel/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /salvar rascunho/i })).toBeDisabled();
  });

  it('publicar o rascunho de outra pessoa atribui o imóvel ao autor, não a quem publica', async () => {
    h.unico = { tenant_brokers: { name: 'Bruno Autor', email: 'bruno@x.com', phone: '(11) 98888-7777' } };
    await abrir({ ...rascunhoCompleto, criado_por: 'autor-1' });

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /publicar imóvel/i })); });

    const atribuicao = h.escritas.find((x) => x.tabela === 'imoveis_corretores');
    expect(atribuicao?.payload).toMatchObject({
      codigo_imovel: 'AP0001',
      corretor_id: 'autor-1',
      corretor_nome: 'Bruno Autor',
      corretor_email: 'bruno@x.com',
      corretor_telefone: '11988887777',
    });
  });

  it('se a atribuição falhar depois de publicar, o retry refaz a atribuição sem acusar "não é mais rascunho"', async () => {
    let falhar = true;
    h.responder = (e) => {
      if (e.tabela === 'imoveis_corretores' && falhar) {
        falhar = false;
        return Promise.resolve({ data: null, error: { message: 'rede caiu' } });
      }
      return Promise.resolve({ data: [{ updated_at: '2026-09-14T13:10:00Z' }], error: null });
    };
    await abrir(rascunhoCompleto);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /publicar imóvel/i })); });
    expect(screen.getByText('rede caiu')).toBeInTheDocument();

    // A linha já é "aguardando": o retry não passa mais pelo update condicional do rascunho.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /salvar imóvel/i })); });
    expect(screen.queryByText(/não é mais um rascunho/)).not.toBeInTheDocument();
    const atribuicoes = h.escritas.filter((x) => x.tabela === 'imoveis_corretores');
    expect(atribuicoes).toHaveLength(2);
    expect(atribuicoes[1].payload).toMatchObject({ corretor_id: 'u1' });
    // Linha já existe: UPDATE sem o filtro de rascunho (e nunca upsert, que exigiria SELECT no proprietário).
    expect(updates()[1]).toMatchObject({ op: 'update', payload: { status_aprovacao: 'aguardando' } });
    expect(updates()[1].filtros).not.toHaveProperty('status_aprovacao');
  });

  it('rascunho grava só o título digitado; a publicação monta o automático com o endereço atual', async () => {
    await abrir(rascunhoCompleto);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /salvar rascunho/i })); });
    expect(updates()[0].payload.titulo).toBeNull();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /publicar imóvel/i })); });
    expect(updates()[1].payload.titulo).toBe('Apartamento - Centro - Jundiaí');
  });

  it('finalidade e tipo ficam travados enquanto o rascunho é salvo (o código sai do tipo)', async () => {
    let concluir: (r: Resposta) => void = () => {};
    h.responder = () => new Promise<Resposta>((ok) => { concluir = ok; });
    await abrir();
    // Estrutura abre por padrão e vem antes das outras seções com select: [finalidade, tipo].
    const [finalidade, tipo] = screen.getAllByRole('combobox');
    expect(finalidade).toBeEnabled();
    expect(tipo).toBeEnabled();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /salvar rascunho/i })); });
    expect(finalidade).toBeDisabled();
    expect(tipo).toBeDisabled();

    await act(async () => concluir({ data: [{ updated_at: '2026-09-14T13:10:00Z' }], error: null }));
    expect(finalidade).toBeEnabled();
  });

  it('rascunho guarda link de vídeo/tour incompleto como digitado', async () => {
    await abrir({ ...rascunho, link_video: 'youtube.com/wat', tour_virtual: 'www.meutour.com' });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /salvar rascunho/i })); });
    expect(updates()[0].payload).toMatchObject({ link_video: 'youtube.com/wat', tour_virtual: 'www.meutour.com' });
  });

  it('não fecha (nem pergunta) enquanto uma gravação está em curso', async () => {
    let concluir: (r: Resposta) => void = () => {};
    h.responder = () => new Promise<Resposta>((ok) => { concluir = ok; });
    const onClose = await abrir();
    digitarTitulo('Alterado');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /salvar rascunho/i })); });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText(/Deseja sair mesmo assim/i)).not.toBeInTheDocument();

    await act(async () => concluir({ data: [{ updated_at: '2026-09-14T13:10:00Z' }], error: null }));
  });

  it('carrega o proprietário pela RPC, sem contar como alteração, e o envia no save', async () => {
    await abrir();
    // Só o carregamento: nada a salvar.
    await avancar(20000);
    expect(updates()).toHaveLength(0);

    digitarTitulo('Com dono');
    await avancar(5000);
    expect(updates()[0].payload).toMatchObject({
      proprietario_nome: 'Carlos Dono',
      proprietario_telefone: '(11) 97777-6666',
      proprietario_email: 'carlos@x.com',
    });
  });

  it('sem permissão para ver o proprietário: nada dele na tela nem no payload', async () => {
    h.proprietario = null;
    await abrir();
    fireEvent.click(screen.getByText('Proprietário'));

    expect(screen.getByText(/visíveis só para o corretor captador/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('email@exemplo.com')).not.toBeInTheDocument();

    digitarTitulo('Editado por quem não vê o dono');
    await avancar(5000);
    const [e] = updates();
    expect(e.payload.titulo).toBe('Editado por quem não vê o dono');
    // Omitidas, e não vazias: vazio apagaria o proprietário gravado.
    for (const coluna of ['proprietario_nome', 'proprietario_telefone', 'proprietario_tel_residencial', 'proprietario_tel_comercial', 'proprietario_email']) {
      expect(e.payload).not.toHaveProperty(coluna);
    }
  });

  it('sem permissão, publicar não cobra o proprietário no formulário (o banco confere o gravado)', async () => {
    h.proprietario = null;
    await abrir(rascunhoCompleto);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /publicar imóvel/i })); });

    expect(updates()[0]).toMatchObject({ op: 'update', payload: { status_aprovacao: 'aguardando' } });
    expect(updates()[0].payload).not.toHaveProperty('proprietario_nome');
  });

  it('publicar sem proprietário ou endereço não grava nada e lista o que falta', async () => {
    h.proprietario = { ...DONO, proprietario_nome: '', proprietario_telefone: null, proprietario_email: null };
    const onClose = await abrir({ ...rascunhoCompleto, logradouro: '', numero: '' });

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /publicar imóvel/i })); });

    const aviso = screen.getByText(/Preencha os seguintes campos/);
    expect(aviso.textContent).toContain('- Nome do proprietário');
    expect(aviso.textContent).toContain('- Telefone ou e-mail do proprietário');
    expect(aviso.textContent).toContain('- Logradouro');
    expect(aviso.textContent).toContain('- Número');
    expect(updates()).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
    // Continua rascunho editável.
    expect(screen.getByRole('button', { name: /salvar rascunho/i })).toBeEnabled();
  });

  it('publicação recusada pelo banco mostra o motivo e mantém o rascunho aberto', async () => {
    h.responder = (e) =>
      e.tabela === 'imoveis_locais' && e.payload.status_aprovacao === 'aguardando'
        ? Promise.resolve({ data: null, error: { code: '23514', message: 'Não foi possível publicar o imóvel AP0001. Preencha: CEP (8 dígitos).' } })
        : Promise.resolve({ data: [{ updated_at: '2026-09-14T13:10:00Z' }], error: null });
    const onClose = await abrir(rascunhoCompleto);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /publicar imóvel/i })); });

    expect(screen.getByText(/Preencha: CEP \(8 dígitos\)/)).toBeInTheDocument();
    expect(h.escritas.some((x) => x.tabela === 'imoveis_corretores')).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    // Ainda é rascunho: o próximo save volta a usar o update condicional.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /salvar rascunho/i })); });
    expect(updates().at(-1)).toMatchObject({ op: 'update', filtros: { status_aprovacao: 'rascunho' }, payload: { status_aprovacao: 'rascunho' } });
  });

  it('imóvel publicado não tem autosave nem botão de rascunho', async () => {
    await abrir({ ...rascunho, status_aprovacao: 'aprovado' });
    expect(screen.getByText('Editar Imóvel')).toBeInTheDocument();
    expect(screen.queryByText('Salvar rascunho')).not.toBeInTheDocument();

    digitarTitulo('Mudou');
    await avancar(20000);
    expect(updates()).toHaveLength(0);
  });
});
