/**
 * 🏠 Modal de Detalhes do Imóvel
 * Substitui o antigo painel lateral. Exibe os detalhes do imóvel em um modal
 * centralizado, seguindo a estética dos cards do catálogo, e oferece o botão
 * "Editar" para abrir o formulário de edição.
 */

import { useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Tag,
  Key,
  MapPin,
  Bed,
  Bath,
  Car,
  Home,
  Ruler,
  ExternalLink,
  Pencil,
  History,
  Image as ImageIcon,
  Mail,
  Phone,
} from 'lucide-react';
import type { Imovel } from '@/features/imoveis/services/kenloService';
import { useAuth } from '@/hooks/useAuth';
import { getFotoCapaUrl, getFotoUrl, type FotoInput } from './fotos-helpers';
import { podeEditarImovel } from '@/features/imoveis/utils/podeEditarImovel';
import { ImovelHistorico } from './ImovelHistorico';

interface ImovelDetalhesModalProps {
  imovel: Imovel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Quando true, o imóvel possui registro local editável. O botão "Editar" só
   * aparece se, além disso, o usuário for diretoria (owner), administrador,
   * o captador (corretor responsável) ou quem cadastrou o imóvel.
   */
  canEdit?: boolean;
  onEditar?: () => void;
  obsInterna?: string | null;
  /** `imoveis_locais.criado_por` — corretor que cadastrou o imóvel. */
  criadoPor?: string | null;
}

const formatCurrency = (value: number) => {
  if (!value || value === 0) return '-';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const StatTile = ({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: ReactNode;
  label: string;
}) => (
  <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-border bg-muted/30 py-3">
    <span className="text-primary">{icon}</span>
    <span className="text-base font-semibold text-text-primary">{value}</span>
    <span className="text-[11px] text-text-secondary">{label}</span>
  </div>
);

const FinalidadeBadges = ({ finalidade }: { finalidade: Imovel['finalidade'] }) => {
  const venda = (
    <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
      <Tag className="h-3 w-3 mr-1" />
      Venda
    </Badge>
  );
  const locacao = (
    <Badge className="bg-pink-500/10 text-pink-500 border-pink-500/20">
      <Key className="h-3 w-3 mr-1" />
      Locação
    </Badge>
  );
  if (finalidade === 'venda_locacao') {
    return (
      <div className="flex gap-1.5">
        {venda}
        {locacao}
      </div>
    );
  }
  return finalidade === 'locacao' ? locacao : venda;
};

const SectionTitle = ({ children }: { children: ReactNode }) => (
  <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
    {children}
  </h4>
);

export const ImovelDetalhesModal = ({
  imovel,
  open,
  onOpenChange,
  canEdit = false,
  onEditar,
  obsInterna,
  criadoPor,
}: ImovelDetalhesModalProps) => {
  const { user, isOwner, tenantId: authTenantId } = useAuth();
  const [mostrarLogs, setMostrarLogs] = useState(false);

  if (!imovel) return null;

  const podeEditar = podeEditarImovel({
    temRegistroLocal: canEdit,
    isPlatformOwner: isOwner,
    systemRole: user?.systemRole,
    userId: user?.id,
    userEmail: user?.email,
    captadorEmail: imovel.corretor_email,
    criadoPor,
  });

  const fotos = (imovel.fotos || []) as FotoInput[];
  const capa = getFotoCapaUrl(fotos);
  const temAreaUtil = imovel.area_util > 0;
  const temAreaTotal = imovel.area_total > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        {/* Hero */}
        <div className="relative h-56 bg-gradient-to-br from-muted to-muted/40 overflow-hidden rounded-t-lg">
          {capa ? (
            <img
              src={capa}
              alt={imovel.titulo}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="h-16 w-16 text-muted-foreground/40" />
            </div>
          )}

          {/* Gradiente para legibilidade dos badges */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-transparent pointer-events-none" />

          <div className="absolute top-3 left-3">
            <Badge className="bg-black/70 text-white border-0 font-mono">{imovel.referencia}</Badge>
          </div>
          {imovel.fotos && imovel.fotos.length > 0 && (
            <div className="absolute bottom-3 right-3">
              <Badge className="bg-black/70 text-white border-0">
                <ImageIcon className="h-3 w-3 mr-1" />
                {imovel.fotos.length}
              </Badge>
            </div>
          )}
        </div>

        {/* Título */}
        <DialogHeader className="text-left px-5 pt-5 space-y-2">
          <DialogTitle className="text-xl font-bold text-text-primary leading-tight">
            {imovel.titulo}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 text-text-secondary">
            <MapPin className="h-4 w-4 flex-shrink-0" />
            <span>
              {imovel.bairro}, {imovel.cidade} - {imovel.estado}
            </span>
          </DialogDescription>
          <div className="pt-1">
            <FinalidadeBadges finalidade={imovel.finalidade} />
          </div>
        </DialogHeader>

        <div className="px-5 py-5 space-y-6">
          {/* Valores */}
          <div className="rounded-xl border border-border bg-card/40 p-4">
            <SectionTitle>Valores</SectionTitle>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <p className="text-xs text-text-secondary">Venda</p>
                <p className="text-lg font-bold text-green-600">
                  {formatCurrency(imovel.valor_venda)}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Locação</p>
                <p className="text-lg font-bold text-blue-600">
                  {imovel.valor_locacao > 0 ? `${formatCurrency(imovel.valor_locacao)}/mês` : '-'}
                </p>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm text-text-secondary">Condomínio</span>
                <span className="text-sm font-medium text-text-primary">
                  {formatCurrency(imovel.valor_condominio)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm text-text-secondary">IPTU</span>
                <span className="text-sm font-medium text-text-primary">
                  {formatCurrency(imovel.valor_iptu)}
                </span>
              </div>
            </div>
          </div>

          {/* Características */}
          <div>
            <SectionTitle>Características</SectionTitle>
            <div className="grid grid-cols-4 gap-2">
              <StatTile icon={<Bed className="h-5 w-5" />} value={imovel.quartos || 0} label="Quartos" />
              <StatTile icon={<Home className="h-5 w-5" />} value={imovel.suites || 0} label="Suítes" />
              <StatTile icon={<Bath className="h-5 w-5" />} value={imovel.banheiro || 0} label="Banheiros" />
              <StatTile icon={<Car className="h-5 w-5" />} value={imovel.garagem || 0} label="Vagas" />
            </div>
            {(temAreaTotal || temAreaUtil) && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <StatTile
                  icon={<Ruler className="h-5 w-5" />}
                  value={temAreaTotal ? `${imovel.area_total} m²` : '-'}
                  label="Área total"
                />
                <StatTile
                  icon={<Ruler className="h-5 w-5" />}
                  value={temAreaUtil ? `${imovel.area_util} m²` : '-'}
                  label="Área útil"
                />
              </div>
            )}
          </div>

          {/* Captador — sempre visível: "Sem captador" é informação, não ausência dela.
              corretor_foto/email/numero só são do MESMO corretor exibido em corretor_nome
              quando o nome veio do XML (corretorContatoDaXml). Quando o nome veio de uma
              atribuição manual (captador_id), esses campos ainda pertencem ao corretor do
              XML e não devem aparecer junto de outro nome. */}
          <div className="rounded-xl border border-border bg-card/40 p-4">
            <SectionTitle>Captador</SectionTitle>
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12 rounded-xl">
                {imovel.corretorContatoDaXml && (
                  <AvatarImage src={imovel.corretor_foto} alt={imovel.corretor_nome || 'Corretor'} />
                )}
                <AvatarFallback className="rounded-xl bg-primary/10 text-primary font-semibold">
                  {(imovel.corretor_nome || '?').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-text-primary truncate">
                  {imovel.corretor_nome || 'Sem captador'}
                </p>
                {imovel.corretorContatoDaXml && imovel.corretor_email && (
                  <p className="flex items-center gap-1.5 text-xs text-text-secondary truncate">
                    <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                    {imovel.corretor_email}
                  </p>
                )}
                {imovel.corretorContatoDaXml && imovel.corretor_numero && (
                  <p className="flex items-center gap-1.5 text-xs text-text-secondary truncate">
                    <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                    {imovel.corretor_numero}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Descrição */}
          {imovel.descricao && (
            <div>
              <SectionTitle>Descrição</SectionTitle>
              <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">
                {imovel.descricao}
              </p>
            </div>
          )}

          {obsInterna && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <SectionTitle>Observação Interna</SectionTitle>
              <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">
                {obsInterna}
              </p>
            </div>
          )}

          {/* Fotos */}
          {imovel.fotos && imovel.fotos.length > 0 && (
            <div>
              <SectionTitle>Fotos</SectionTitle>
              <div className="grid grid-cols-3 gap-2">
                {fotos.slice(0, 9).map((foto, idx) => {
                  const url = getFotoUrl(foto);
                  if (!url) return null;
                  return (
                    <a
                      key={`${url}-${idx}`}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-lg overflow-hidden border border-border hover:opacity-90 transition-opacity"
                    >
                      <img
                        src={url}
                        alt={`Foto ${idx + 1}`}
                        className="w-full h-24 object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </a>
                  );
                })}
              </div>
              {imovel.fotos.length > 9 && (
                <p className="text-xs text-text-secondary mt-2">
                  Mostrando 9 de {imovel.fotos.length} fotos
                </p>
              )}
            </div>
          )}

          {/* Vídeos */}
          {imovel.videos && imovel.videos.length > 0 && (
            <div>
              <SectionTitle>Vídeos</SectionTitle>
              <div className="space-y-2">
                {imovel.videos.map((url, idx) => (
                  <a
                    key={`${url}-${idx}`}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{url}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Logs de alterações — só existem para imóveis com registro local. */}
          {canEdit && mostrarLogs && (
            <div>
              <SectionTitle>Logs de alterações</SectionTitle>
              <ImovelHistorico
                tenantId={authTenantId || user?.tenantId}
                codigoImovel={imovel.referencia}
              />
            </div>
          )}

        </div>

        {/* Ações */}
        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border bg-background/95 backdrop-blur px-5 py-3">
          <DialogClose asChild>
            <Button variant="outline">Fechar</Button>
          </DialogClose>
          {canEdit && (
            <Button variant="outline" onClick={() => setMostrarLogs((v) => !v)}>
              <History className="h-4 w-4 mr-2" />
              {mostrarLogs ? 'Ocultar logs' : 'Logs de alterações'}
            </Button>
          )}
          {podeEditar && (
            <Button onClick={onEditar}>
              <Pencil className="h-4 w-4 mr-2" />
              Editar imóvel
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
