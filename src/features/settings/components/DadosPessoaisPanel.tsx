/**
 * Aba "Dados pessoais" de Configurações: o próprio membro preenche RG, CPF,
 * endereço e dados de recebimento. É a mesma linha de `tenant_member_dados`
 * que o gestor confere em Gestão de Equipe — a RLS libera o próprio usuário.
 */

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { DadosCadastraisFields } from '@/features/corretores/components/DadosCadastraisFields';
import {
  fetchMemberDados,
  saveMemberDados,
  EMPTY_MEMBER_DADOS,
  type MemberDados,
} from '@/features/corretores/services/memberDadosService';

interface Props {
  tenantId: string;
  userId: string;
}

export function DadosPessoaisPanel({ tenantId, userId }: Props) {
  const { toast } = useToast();
  const [dados, setDados] = useState<MemberDados>({ ...EMPTY_MEMBER_DADOS });
  const [salvos, setSalvos] = useState<MemberDados>({ ...EMPTY_MEMBER_DADOS });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    fetchMemberDados(tenantId, userId)
      .then((d) => {
        if (!ativo) return;
        setDados(d);
        setSalvos(d);
      })
      .finally(() => ativo && setCarregando(false));
    return () => { ativo = false; };
  }, [tenantId, userId]);

  // Só grava o que mudou: um Salvar sem edição não sobrescreve nada.
  const mudou = JSON.stringify(dados) !== JSON.stringify(salvos);

  const salvar = async () => {
    setSalvando(true);
    try {
      const result = await saveMemberDados(tenantId, userId, dados);
      if (!result.success) {
        toast({ title: 'Erro ao salvar', description: result.error, variant: 'destructive', duration: 4000 });
        return;
      }
      setSalvos(dados);
      toast({ title: 'Dados pessoais salvos!', duration: 3000 });
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando seus dados…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-slate-500 dark:text-slate-400">
        Visíveis só para você e para a administração da imobiliária.
      </p>
      <DadosCadastraisFields dados={dados} setDados={setDados} disabled={salvando} />
      <div className="pt-2 flex justify-end">
        <Button
          onClick={salvar}
          disabled={salvando || !mudou}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8"
        >
          {salvando ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</>
          ) : (
            <><Save className="h-4 w-4 mr-2" /> Salvar dados pessoais</>
          )}
        </Button>
      </div>
    </div>
  );
}
