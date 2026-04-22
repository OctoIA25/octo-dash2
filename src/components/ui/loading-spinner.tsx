import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'default' | 'accent' | 'gradient';
  className?: string;
  text?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6', 
  lg: 'h-8 w-8',
  xl: 'h-12 w-12'
};

const variantClasses = {
  default: 'text-text-primary',
  accent: 'text-accent-blue',
  gradient: 'text-transparent bg-clip-text bg-gradient-to-r from-accent-purple to-accent-blue'
};

export const LoadingSpinner = ({ 
  size = 'md', 
  variant = 'default', 
  className, 
  text 
}: LoadingSpinnerProps) => {
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className="relative">
        <Loader2 
          className={cn(
            sizeClasses[size],
            variantClasses[variant],
            'animate-spin',
            className
          )} 
        />
        {variant === 'gradient' && (
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-accent-purple to-accent-blue opacity-20 blur-sm animate-pulse" />
        )}
      </div>
      {text && (
        <p className={cn(
          'text-sm font-medium',
          variant === 'gradient' 
            ? 'text-transparent bg-clip-text bg-gradient-to-r from-accent-purple to-accent-blue'
            : 'text-text-secondary'
        )}>
          {text}
        </p>
      )}
    </div>
  );
};

// Componente de loading para páginas inteiras
export const PageLoading = ({ text = "Carregando..." }: { text?: string }) => {
  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-bg-secondary rounded-full animate-spin">
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-transparent border-t-accent-blue rounded-full animate-spin"></div>
          </div>
          <div className="absolute inset-0 w-16 h-16 bg-gradient-to-r from-accent-purple/20 to-accent-blue/20 rounded-full blur-xl animate-pulse"></div>
        </div>
        <div className="space-y-2">
          <h2 className="text-text-primary text-xl font-semibold text-glow-subtle">
            {text}
          </h2>
          <p className="text-text-secondary text-sm">
            Conectando ao Supabase...
          </p>
        </div>
        {/* Barras de loading animadas */}
        <div className="flex justify-center gap-1">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="w-1 bg-gradient-to-t from-accent-purple to-accent-blue rounded-full animate-pulse"
              style={{
                height: `${Math.random() * 20 + 10}px`,
                animationDelay: `${i * 0.1}s`,
                animationDuration: '1s'
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// Skeleton loading para cards
export const CardSkeleton = () => {
  return (
    <div className="bg-bg-card/60 backdrop-blur-sm border-bg-secondary/40 rounded-lg p-4 space-y-3 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-3 bg-bg-secondary rounded w-20"></div>
          <div className="h-6 bg-bg-secondary rounded w-16"></div>
          <div className="h-3 bg-bg-secondary rounded w-24"></div>
        </div>
        <div className="h-10 w-10 bg-bg-secondary rounded-lg"></div>
      </div>
    </div>
  );
};

// Skeleton para tabela
export const TableSkeleton = ({ rows = 5 }: { rows?: number }) => {
  return (
    <div className="bg-bg-card/60 backdrop-blur-sm border-bg-secondary/40 rounded-lg overflow-hidden">
      <div className="p-5 border-b border-bg-secondary/40">
        <div className="h-6 bg-bg-secondary rounded w-48 animate-pulse"></div>
      </div>
      <div className="divide-y divide-bg-secondary/50">
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="p-4 flex items-center gap-4 animate-pulse">
            <div className="h-4 bg-bg-secondary rounded flex-1"></div>
            <div className="h-4 bg-bg-secondary rounded w-20"></div>
            <div className="h-4 bg-bg-secondary rounded w-16"></div>
            <div className="h-4 bg-bg-secondary rounded w-24"></div>
            <div className="h-4 bg-bg-secondary rounded w-20"></div>
          </div>
        ))}
      </div>
    </div>
  );
};
