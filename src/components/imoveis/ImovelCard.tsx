/**
 * 🏠 Card de Imóvel
 * Exibe informações completas de um imóvel do catálogo
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getFotoCapaUrl } from './fotos-helpers';
import { 
  Home, 
  Building2, 
  LandPlot, 
  MapPin, 
  Bed, 
  Bath, 
  Car, 
  Ruler, 
  Tag,
  Key,
  ExternalLink,
  Image as ImageIcon,
  Trash2
} from 'lucide-react';
import { Imovel } from '@/features/imoveis/services/kenloService';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface ImovelCardProps {
  imovel: Imovel;
  onViewDetails?: (imovel: Imovel) => void;
  onDelete?: (referencia: string) => void;
  canDelete?: boolean;
}

export const ImovelCard = ({ imovel, onViewDetails, onDelete, canDelete }: ImovelCardProps) => {
  const [imageError, setImageError] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const formatCurrency = (value: number) => {
    if (value === 0) return '-';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const getTipoIcon = () => {
    switch (imovel.tipoSimplificado) {
      case 'casa':
        return <Home className="h-4 w-4" />;
      case 'apartamento':
        return <Building2 className="h-4 w-4" />;
      case 'terreno':
        return <LandPlot className="h-4 w-4" />;
      default:
        return <Home className="h-4 w-4" />;
    }
  };

  const getTipoBadgeColor = () => {
    switch (imovel.tipoSimplificado) {
      case 'casa':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'apartamento':
        return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      case 'terreno':
        return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'comercial':
        return 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20';
      case 'rural':
        return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      default:
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  const getFinalidadeBadge = () => {
    if (imovel.finalidade === 'venda_locacao') {
      return (
        <div className="flex gap-1">
          <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
            <Tag className="h-3 w-3 mr-1" />
            Venda
          </Badge>
          <Badge className="bg-pink-500/10 text-pink-500 border-pink-500/20">
            <Key className="h-3 w-3 mr-1" />
            Locação
          </Badge>
        </div>
      );
    } else if (imovel.finalidade === 'venda') {
      return (
        <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
          <Tag className="h-3 w-3 mr-1" />
          Venda
        </Badge>
      );
    } else {
      return (
        <Badge className="bg-pink-500/10 text-pink-500 border-pink-500/20">
          <Key className="h-3 w-3 mr-1" />
          Locação
        </Badge>
      );
    }
  };

  const primeiraFoto = getFotoCapaUrl(imovel.fotos as any);

  return (
    <Card 
      className="overflow-hidden hover:shadow-xl transition-all duration-300 group cursor-pointer"
      style={{ 
        backgroundColor: 'var(--card-bg)',
        borderColor: 'var(--border-color)'
      }}
      onClick={() => onViewDetails?.(imovel)}
    >
      {/* Imagem do Imóvel */}
      <div className="relative h-48 bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden">
        {primeiraFoto && !imageError ? (
          <img 
            src={primeiraFoto} 
            alt={imovel.titulo}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="h-16 w-16 text-gray-400" />
          </div>
        )}
        
        {/* Badge de Referência */}
        <div className="absolute top-2 left-2">
          <Badge className="bg-black/70 text-white border-0 font-mono">
            {imovel.referencia}
          </Badge>
        </div>

        {/* Badge de Tipo */}
        <div className="absolute top-2 right-2">
          <Badge className={getTipoBadgeColor()}>
            {getTipoIcon()}
            <span className="ml-1 capitalize">{imovel.tipoSimplificado}</span>
          </Badge>
        </div>

        {/* Quantidade de Fotos */}
        {imovel.fotos.length > 0 && (
          <div className="absolute bottom-2 right-2">
            <Badge className="bg-black/70 text-white border-0">
              <ImageIcon className="h-3 w-3 mr-1" />
              {imovel.fotos.length}
            </Badge>
          </div>
        )}
      </div>

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <CardTitle className="text-base font-semibold text-text-primary line-clamp-2 flex-1">
            {imovel.titulo}
          </CardTitle>
        </div>

        <div className="flex items-center gap-1 text-text-secondary text-sm">
          <MapPin className="h-3 w-3" />
          <span>{imovel.bairro}, {imovel.cidade} - {imovel.estado}</span>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {/* Valores */}
        <div className="space-y-2">
          {imovel.valor_venda > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Venda:</span>
              <span className="text-lg font-bold text-green-600">
                {formatCurrency(imovel.valor_venda)}
              </span>
            </div>
          )}
          
          {imovel.valor_locacao > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Locação:</span>
              <span className="text-lg font-bold text-blue-600">
                {formatCurrency(imovel.valor_locacao)}/mês
              </span>
            </div>
          )}

          {imovel.valor_condominio > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-secondary">Condomínio:</span>
              <span className="text-xs text-text-secondary">
                {formatCurrency(imovel.valor_condominio)}
              </span>
            </div>
          )}
        </div>

        {/* Características */}
        {imovel.tipoSimplificado !== 'terreno' && (
          <div className="flex items-center justify-between text-sm">
            {imovel.quartos > 0 && (
              <div className="flex items-center gap-1 text-text-secondary">
                <Bed className="h-4 w-4" />
                <span>{imovel.quartos}</span>
              </div>
            )}
            
            {imovel.banheiro > 0 && (
              <div className="flex items-center gap-1 text-text-secondary">
                <Bath className="h-4 w-4" />
                <span>{imovel.banheiro}</span>
              </div>
            )}
            
            {imovel.garagem > 0 && (
              <div className="flex items-center gap-1 text-text-secondary">
                <Car className="h-4 w-4" />
                <span>{imovel.garagem}</span>
              </div>
            )}
            
            {imovel.area_util > 0 && (
              <div className="flex items-center gap-1 text-text-secondary">
                <Ruler className="h-4 w-4" />
                <span>{imovel.area_util}m²</span>
              </div>
            )}
          </div>
        )}

        {/* Área para Terrenos */}
        {imovel.tipoSimplificado === 'terreno' && imovel.area_total > 0 && (
          <div className="flex items-center justify-center gap-2 text-text-secondary">
            <Ruler className="h-4 w-4" />
            <span className="font-semibold">{imovel.area_total}m²</span>
          </div>
        )}

        {/* Badges de Finalidade */}
        <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
          {getFinalidadeBadge()}
        </div>

        {/* Botões de Ação */}
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className="flex-1 group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails?.(imovel);
            }}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Ver Detalhes
          </Button>
          
          {canDelete && onDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="outline" 
                  size="icon"
                  className="text-red-500 hover:bg-red-500 hover:text-white border-red-200"
                  onClick={(e) => e.stopPropagation()}
                  disabled={isDeleting}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir Imóvel</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tem certeza que deseja excluir o imóvel <strong>{imovel.referencia}</strong>?
                    <br /><br />
                    Esta ação não pode ser desfeita. O imóvel será removido permanentemente do sistema.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-500 hover:bg-red-600"
                    onClick={() => {
                      setIsDeleting(true);
                      onDelete(imovel.referencia);
                    }}
                  >
                    {isDeleting ? 'Excluindo...' : 'Excluir'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

