/**
 * 🔄 Modal para Criar Novo Corretor
 * Permite criar corretores com todos os dados necessários
 */

import { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  User, 
  Mail, 
  Lock, 
  Phone, 
  Users, 
  Briefcase,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle,
  AlertCircle,
  IdCard
} from 'lucide-react';
import {
  criarCorretor,
  atualizarCorretor,
  gerarEmailAutomatico,
  validarDadosCorretor,
  NovoCorretor,
  CorretorCadastrado,
} from '../services/corretoresService';

interface CriarCorretorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (corretor: any) => void;
  createdById?: string;
  /** Se fornecido, abre o modal em modo edição. */
  corretorToEdit?: CorretorCadastrado | null;
}

const EQUIPES = [
  { value: 'verde', label: 'Equipe Verde', color: 'bg-green-500' },
  { value: 'vermelha', label: 'Equipe Vermelha', color: 'bg-red-500' },
  { value: 'amarela', label: 'Equipe Amarela', color: 'bg-yellow-500' },
  { value: 'azul', label: 'Equipe Azul', color: 'bg-blue-500' },
];

const CARGOS = [
  { value: 'corretor', label: 'Corretor' },
  { value: 'team_leader', label: 'Líder de Equipe' },
  { value: 'gerente', label: 'Gerente' },
  { value: 'admin', label: 'Administrador da Imobiliária' },
];

export const CriarCorretorModal = ({
  isOpen,
  onClose,
  onSuccess,
  createdById,
  corretorToEdit,
}: CriarCorretorModalProps) => {
  const isEditMode = Boolean(corretorToEdit);
  const [formData, setFormData] = useState<Partial<NovoCorretor>>({
    nome: '',
    email: '',
    senha: '',
    telefone: '',
    equipe: undefined,
    cargo: 'corretor',
    creci: '',
    ativo: true,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [errosValidacao, setErrosValidacao] = useState<string[]>([]);

  // Reset/hidrata form quando modal abre/fecha.
  useEffect(() => {
    if (isOpen) {
      if (corretorToEdit) {
        setFormData({
          nome: corretorToEdit.nm_corretor || '',
          email: corretorToEdit.email || '',
          senha: '',
          telefone: corretorToEdit.telefone || '',
          equipe: (corretorToEdit.equipe as NovoCorretor['equipe']) || undefined,
          cargo: (corretorToEdit.cargo as NovoCorretor['cargo']) || 'corretor',
          creci: corretorToEdit.creci || '',
          ativo: corretorToEdit.ativo ?? true,
        });
      } else {
        setFormData({
          nome: '',
          email: '',
          senha: '',
          telefone: '',
          equipe: undefined,
          cargo: 'corretor',
          creci: '',
          ativo: true,
        });
      }
      setStatus('idle');
      setErrorMessage('');
      setErrosValidacao([]);
    }
  }, [isOpen, corretorToEdit]);

  // Gerar email automaticamente quando nome muda
  useEffect(() => {
    if (formData.nome && formData.nome.length >= 3) {
      const emailGerado = gerarEmailAutomatico(formData.nome);
      setFormData(prev => ({ ...prev, email: emailGerado }));
    }
  }, [formData.nome]);

  const handleInputChange = (field: keyof NovoCorretor, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Limpar erros ao digitar
    if (errosValidacao.length > 0) {
      setErrosValidacao([]);
    }
  };

  const formatarTelefone = (valor: string) => {
    // Remove tudo que não é número
    const numeros = valor.replace(/\D/g, '');
    
    // Aplica máscara
    if (numeros.length <= 2) {
      return numeros;
    } else if (numeros.length <= 7) {
      return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`;
    } else if (numeros.length <= 11) {
      return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
    } else {
      return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7, 11)}`;
    }
  };

  const handleTelefoneChange = (valor: string) => {
    const telefoneFormatado = formatarTelefone(valor);
    setFormData(prev => ({ ...prev, telefone: telefoneFormatado }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // No modo edição o campo senha é opcional
    const dadosParaValidar = isEditMode
      ? { ...formData, senha: formData.senha || '********' }
      : formData;
    const validacao = validarDadosCorretor(dadosParaValidar);
    if (!validacao.valido) {
      setErrosValidacao(validacao.erros);
      return;
    }

    setIsLoading(true);
    setStatus('idle');
    setErrorMessage('');

    try {
      const resultado = isEditMode && corretorToEdit
        ? await atualizarCorretor(corretorToEdit.id, formData)
        : await criarCorretor(formData as NovoCorretor, createdById);

      if (resultado.success) {
        setStatus('success');
        if (onSuccess && 'data' in resultado && resultado.data) {
          onSuccess(resultado.data);
        } else if (onSuccess) {
          onSuccess(null);
        }
        setTimeout(() => onClose(), 1200);
      } else {
        setStatus('error');
        setErrorMessage(resultado.error || 'Erro ao salvar corretor');
      }
    } catch (error) {
      console.error('❌ Erro ao salvar corretor:', error);
      setStatus('error');
      setErrorMessage('Erro inesperado ao salvar corretor');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-white dark:bg-slate-900 dark:bg-gray-900 border dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-gray-900 dark:text-slate-100 dark:text-white">
            <div className="p-2 rounded-full bg-gradient-to-br from-blue-600 to-cyan-600">
              <User className="h-5 w-5 text-white" />
            </div>
            {isEditMode ? 'Editar Corretor' : 'Criar Novo Corretor'}
          </DialogTitle>
          <DialogDescription className="text-gray-600 dark:text-slate-400 dark:text-gray-400">
            {isEditMode
              ? 'Atualize os dados do corretor, incluindo cargo e equipe.'
              : 'Preencha os dados para cadastrar um novo corretor no sistema.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Nome */}
          <div className="space-y-2">
            <Label htmlFor="nome" className="flex items-center gap-2 text-gray-700 dark:text-slate-300 dark:text-gray-300">
              <User className="h-4 w-4" />
              Nome Completo *
            </Label>
            <Input
              id="nome"
              value={formData.nome}
              onChange={(e) => handleInputChange('nome', e.target.value)}
              placeholder="Ex: João Silva"
              className="bg-gray-50 dark:bg-slate-950 dark:bg-gray-800 border-gray-200 dark:border-slate-800 dark:border-gray-700"
              disabled={isLoading}
            />
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-2 text-gray-700 dark:text-slate-300 dark:text-gray-300">
              <Mail className="h-4 w-4" />
              Email *
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="email@exemplo.com"
              className="bg-gray-50 dark:bg-slate-950 dark:bg-gray-800 border-gray-200 dark:border-slate-800 dark:border-gray-700"
              disabled={isLoading}
            />
            <p className="text-xs text-gray-500 dark:text-slate-400">Email gerado automaticamente baseado no nome</p>
          </div>

          {/* Senha */}
          <div className="space-y-2">
            <Label htmlFor="senha" className="flex items-center gap-2 text-gray-700 dark:text-slate-300 dark:text-gray-300">
              <Lock className="h-4 w-4" />
              Senha *
            </Label>
            <div className="relative">
              <Input
                id="senha"
                type={showPassword ? 'text' : 'password'}
                value={formData.senha}
                onChange={(e) => handleInputChange('senha', e.target.value)}
                placeholder="Mínimo 4 caracteres"
                className="bg-gray-50 dark:bg-slate-950 dark:bg-gray-800 border-gray-200 dark:border-slate-800 dark:border-gray-700 pr-10"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-gray-300"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Telefone */}
          <div className="space-y-2">
            <Label htmlFor="telefone" className="flex items-center gap-2 text-gray-700 dark:text-slate-300 dark:text-gray-300">
              <Phone className="h-4 w-4" />
              Telefone *
            </Label>
            <Input
              id="telefone"
              value={formData.telefone}
              onChange={(e) => handleTelefoneChange(e.target.value)}
              placeholder="(11) 99999-9999"
              className="bg-gray-50 dark:bg-slate-950 dark:bg-gray-800 border-gray-200 dark:border-slate-800 dark:border-gray-700"
              disabled={isLoading}
            />
          </div>

          {/* Equipe e Cargo */}
          <div className="grid grid-cols-2 gap-4">
            {/* Equipe */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-gray-700 dark:text-slate-300 dark:text-gray-300">
                <Users className="h-4 w-4" />
                Equipe *
              </Label>
              <Select 
                value={formData.equipe} 
                onValueChange={(value) => handleInputChange('equipe', value)}
                disabled={isLoading}
              >
                <SelectTrigger className="bg-gray-50 dark:bg-slate-950 dark:bg-gray-800 border-gray-200 dark:border-slate-800 dark:border-gray-700">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {EQUIPES.map((equipe) => (
                    <SelectItem key={equipe.value} value={equipe.value}>
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${equipe.color}`} />
                        {equipe.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Cargo */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-gray-700 dark:text-slate-300 dark:text-gray-300">
                <Briefcase className="h-4 w-4" />
                Cargo *
              </Label>
              <Select 
                value={formData.cargo} 
                onValueChange={(value) => handleInputChange('cargo', value)}
                disabled={isLoading}
              >
                <SelectTrigger className="bg-gray-50 dark:bg-slate-950 dark:bg-gray-800 border-gray-200 dark:border-slate-800 dark:border-gray-700">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {CARGOS.map((cargo) => (
                    <SelectItem key={cargo.value} value={cargo.value}>
                      {cargo.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* CRECI (opcional) */}
          <div className="space-y-2">
            <Label htmlFor="creci" className="flex items-center gap-2 text-gray-700 dark:text-slate-300 dark:text-gray-300">
              <IdCard className="h-4 w-4" />
              CRECI (opcional)
            </Label>
            <Input
              id="creci"
              value={formData.creci}
              onChange={(e) => handleInputChange('creci', e.target.value)}
              placeholder="Ex: 123456-F"
              className="bg-gray-50 dark:bg-slate-950 dark:bg-gray-800 border-gray-200 dark:border-slate-800 dark:border-gray-700"
              disabled={isLoading}
            />
          </div>

          {/* Erros de validação */}
          {errosValidacao.length > 0 && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 dark:bg-red-900/20 border border-red-200 dark:border-red-900 dark:border-red-800">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
                <div className="space-y-1">
                  {errosValidacao.map((erro, index) => (
                    <p key={index} className="text-sm text-red-600 dark:text-red-300 dark:text-red-400">{erro}</p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Mensagem de erro da API */}
          {status === 'error' && errorMessage && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 dark:bg-red-900/20 border border-red-200 dark:border-red-900 dark:border-red-800">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-500" />
                <p className="text-sm text-red-600 dark:text-red-300 dark:text-red-400">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Mensagem de sucesso */}
          {status === 'success' && (
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/40 dark:bg-green-900/20 border border-green-200 dark:border-green-900 dark:border-green-800">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <p className="text-sm text-green-600 dark:text-green-300 dark:text-green-400">
                  Corretor criado com sucesso!
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="border-gray-200 dark:border-slate-800 dark:border-gray-700"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isLoading || status === 'success'}
              className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isEditMode ? 'Salvando...' : 'Criando...'}
                </>
              ) : status === 'success' ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {isEditMode ? 'Salvo!' : 'Criado!'}
                </>
              ) : (
                <>
                  <User className="h-4 w-4 mr-2" />
                  {isEditMode ? 'Salvar Alterações' : 'Criar Corretor'}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};






