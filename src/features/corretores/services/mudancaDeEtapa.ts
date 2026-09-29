import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { ESTAGIO_POR_LABEL, LABEL_ESTAGIO, podeMover, type EstagioId } from '../domain/recruitmentStages';
import { recruitmentService, type Candidato } from './recruitmentService';
import { createTenantMember } from './tenantMembersService';

/**
 * Mudar a etapa de um candidato tem efeitos FORA de recrut_evento: em Onboard
 * nasce a conta de corretor; ao sair de Onboard para Perdido o membro é
 * desvinculado da equipe. Isso morava em handleMudarStatus, na página; com o
 * Kanban há um segundo caminho para a mesma mudança, e dois caminhos com
 * regras diferentes é o bug que só aparece quando alguém reclama.
 *
 * Duas mudanças de comportamento em relação à página (auditoria de 29/09):
 *
 *  1. Desvincular SÓ em onboard → perdido. A página chamava
 *     `recrutamento_desvincular` para QUALQUER etapa que não fosse Onboard
 *     sempre que o e-mail tinha conta — e a RPC apaga a membership sem olhar
 *     papel. Um admin com o mesmo e-mail de um candidato perdia o acesso ao
 *     mover o candidato de Lead para Interação.
 *
 *  2. Em Onboard, o EVENTO vem antes da conta. Criar a conta primeiro deixava
 *     uma conta órfã quando o evento falhava (23514: onboard exige
 *     coordenador), e a retentativa caía em "Usuário já existe" para sempre.
 *     Agora, se a conta falhar depois do evento, a etapa fica gravada e a
 *     tela avisa para criar o acesso à mão; "já existe" na criação é sucesso.
 *
 * Desde 29/09 o funil também VOLTA: para trás, ou saindo de Perdido, o evento
 * é `estagio_retrocedido` (retrocederEtapa) e NENHUM efeito de conta roda —
 * voltar de Onboard não mexe na conta do corretor.
 *
 * Falha antes de gravar = throw com a mensagem real para a tela.
 */

export type EfeitoDaEtapa = 'criar_conta' | 'desvincular' | 'nenhum';

/** A decisão pura: qual efeito colateral a passagem `de → para` dispara. */
export function efeitoDaEtapa(de: EstagioId | string | null | undefined, paraLabel: string): EfeitoDaEtapa {
  const para = ESTAGIO_POR_LABEL[paraLabel] ?? paraLabel;
  if (para === 'onboard') return 'criar_conta';
  if (de === 'onboard' && para === 'perdido') return 'desvincular';
  return 'nenhum';
}

/** O que a criação da conta devolve quando ela já existia — não é erro. */
const JA_EXISTE = /já é membro|já existe|already|duplicate|exists/i;

export interface MudancaDeEtapa {
  candidato: Pick<Candidato, 'id' | 'nome'> & {
    email?: string | null;
    telefone?: string | null;
    tenant_id?: string | null;
    estagio?: EstagioId | string | null;
  };
  novoLabel: string;
  usuarioEmail?: string;
  tenantId?: string | null;
}

export async function aplicarMudancaDeEtapa({ candidato, novoLabel, usuarioEmail, tenantId }: MudancaDeEtapa): Promise<Candidato> {
  const paraId = (ESTAGIO_POR_LABEL[novoLabel] ?? novoLabel) as EstagioId;
  const deId = (candidato.estagio ?? 'lead') as EstagioId;
  const mover = podeMover(deId, paraId);
  if (mover.ok === false) {
    throw new Error(`${candidato.nome} já está em ${LABEL_ESTAGIO[paraId] ?? novoLabel}`);
  }
  if (mover.sentido === 'volta' || mover.sentido === 'reabre') {
    // Sem conta, sem desvincular: voltar (inclusive de Onboard) e reabrir só
    // mexem no funil. O acesso do corretor é assunto de Gestão de Equipe.
    return recruitmentService.retrocederEtapa(String(candidato.id), paraId, usuarioEmail);
  }

  const efeito = efeitoDaEtapa(candidato.estagio, novoLabel);
  const effectiveTenantId = candidato.tenant_id || tenantId;
  const email = String(candidato.email ?? '').trim();

  if (efeito === 'criar_conta' && !effectiveTenantId) {
    throw new Error('Tenant ID nao encontrado para adicionar o candidato a equipe');
  }

  if (efeito === 'desvincular' && email && effectiveTenantId) {
    // Tira o candidato da EQUIPE, não da plataforma. Aqui já houve um DELETE
    // em user_profiles que apagava a conta da pessoa — e conta apagada não
    // volta. A pergunta é de sim ou não de propósito: quem recruta precisa
    // saber que o e-mail está em uso, não de quem ele é.
    const { data: jaTemConta, error: verifyErr } = await supabase
      .rpc('usuario_ja_tem_conta', { p_email: email });
    if (verifyErr) {
      console.error('❌ Erro ao verificar usuário:', verifyErr);
      throw new Error('Erro ao verificar usuário existente');
    }
    if (jaTemConta) {
      const { data: desvinculo, error: errDesvincular } = await supabase
        .rpc('recrutamento_desvincular', { p_tenant_id: effectiveTenantId, p_email: email });
      if (errDesvincular) {
        console.error('❌ Erro ao desvincular usuário:', errDesvincular);
        throw new Error('Erro ao remover usuário da equipe');
      }
      // `null` = quem chamou não administra esta imobiliária.
      if (!desvinculo) throw new Error('Você não tem permissão para remover este usuário da equipe');
      if ((desvinculo as { desvinculado?: boolean }).desvinculado) toast.success('Usuário removido da equipe');
    }
  }

  // A etapa em si: grava o evento, o trigger recalcula `estagio`.
  const atualizado = await recruitmentService.changeCandidateStatus(String(candidato.id), novoLabel, usuarioEmail);

  if (efeito === 'criar_conta') {
    const cleanEmail = email.toLowerCase();
    const result = await createTenantMember(effectiveTenantId as string, {
      email: cleanEmail,
      password: cleanEmail,
      name: candidato.nome,
      phone: candidato.telefone || undefined,
      role: 'corretor',
      permissions: { origem: 'recrutamento', candidato_id: candidato.id },
    });
    if (result.success) {
      toast.success('Candidato aprovado e adicionado à equipe!');
    } else if (JA_EXISTE.test(result.error ?? '')) {
      toast.success(`${LABEL_ESTAGIO.onboard} gravado — a conta deste e-mail já existia na equipe`);
    } else {
      toast.error(`${LABEL_ESTAGIO.onboard} gravado, mas a conta não foi criada: ${result.error || 'erro desconhecido'}. Crie o acesso à mão em Acessos e Permissões.`);
    }
  }

  return atualizado;
}
