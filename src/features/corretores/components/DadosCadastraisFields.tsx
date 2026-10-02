/**
 * Campos de dados cadastrais (RG, CPF, nascimento, CNPJ, endereço, recebimento).
 *
 * Usado em dois lugares, que gravam na mesma linha de `tenant_member_dados`:
 * o modal de Gestão de Equipe (admin edita qualquer membro) e a aba Perfil de
 * Configurações (o próprio corretor edita os seus). Só os campos — carregar e
 * salvar fica com quem usa.
 */

import type { Dispatch, SetStateAction } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCpf, formatCnpj } from '@/lib/documentoMasks';
import type { MemberDados } from '../services/memberDadosService';

interface Props {
  dados: MemberDados;
  setDados: Dispatch<SetStateAction<MemberDados>>;
  disabled?: boolean;
}

export function DadosCadastraisFields({ dados, setDados, disabled }: Props) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="edit-rg" className="text-xs">RG</Label>
          <Input
            id="edit-rg"
            value={dados.rg}
            onChange={(e) => setDados((d) => ({ ...d, rg: e.target.value }))}
            placeholder="Ex: 12.345.678-9"
            disabled={disabled}
            className="h-10"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-cpf" className="text-xs">CPF</Label>
          <Input
            id="edit-cpf"
            inputMode="numeric"
            value={dados.cpf}
            onChange={(e) => setDados((d) => ({ ...d, cpf: formatCpf(e.target.value) }))}
            placeholder="000.000.000-00"
            disabled={disabled}
            className="h-10"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-nascimento" className="text-xs">Data de nascimento</Label>
          {/* input nativo de data — sem dependência de datepicker */}
          <Input
            id="edit-nascimento"
            type="date"
            value={dados.data_nascimento}
            onChange={(e) => setDados((d) => ({ ...d, data_nascimento: e.target.value }))}
            disabled={disabled}
            className="h-10"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-cnpj" className="text-xs">CNPJ (se tiver)</Label>
          <Input
            id="edit-cnpj"
            inputMode="numeric"
            value={dados.cnpj}
            onChange={(e) => setDados((d) => ({ ...d, cnpj: formatCnpj(e.target.value) }))}
            placeholder="00.000.000/0000-00"
            disabled={disabled}
            className="h-10"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="edit-endereco" className="text-xs">Endereço</Label>
          <Input
            id="edit-endereco"
            value={dados.endereco}
            onChange={(e) => setDados((d) => ({ ...d, endereco: e.target.value }))}
            placeholder="Rua, número, complemento, bairro, cidade/UF, CEP"
            disabled={disabled}
            className="h-10"
          />
        </div>
      </div>

      <div className="space-y-3 pt-1 border-t border-gray-100 dark:border-slate-800">
        <span className="text-xs font-medium text-gray-600 dark:text-slate-400 block pt-3">
          Dados de recebimento
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="edit-pix" className="text-xs">Chave PIX</Label>
            <Input
              id="edit-pix"
              value={dados.pix_chave}
              onChange={(e) => setDados((d) => ({ ...d, pix_chave: e.target.value }))}
              placeholder="CPF, e-mail, telefone ou chave aleatória"
              disabled={disabled}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-banco" className="text-xs">Banco</Label>
            <Input
              id="edit-banco"
              value={dados.banco}
              onChange={(e) => setDados((d) => ({ ...d, banco: e.target.value }))}
              placeholder="Ex: 341 — Itaú"
              disabled={disabled}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-titular" className="text-xs">Titular da conta</Label>
            <Input
              id="edit-titular"
              value={dados.titular}
              onChange={(e) => setDados((d) => ({ ...d, titular: e.target.value }))}
              placeholder="Nome ou razão social"
              disabled={disabled}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-agencia" className="text-xs">Agência</Label>
            <Input
              id="edit-agencia"
              value={dados.agencia}
              onChange={(e) => setDados((d) => ({ ...d, agencia: e.target.value }))}
              placeholder="0000"
              disabled={disabled}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-conta" className="text-xs">Conta</Label>
            <Input
              id="edit-conta"
              value={dados.conta}
              onChange={(e) => setDados((d) => ({ ...d, conta: e.target.value }))}
              placeholder="00000-0"
              disabled={disabled}
              className="h-10"
            />
          </div>
        </div>
      </div>
    </>
  );
}
