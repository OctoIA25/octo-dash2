import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('❌ ErrorBoundary capturou um erro:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Card className="bg-bg-card/40 card-neon border-red-500/30 leads-chart-container h-full flex flex-col">
          <CardHeader className="pb-3 flex-shrink-0">
            <CardTitle className="text-text-primary text-lg neon-text flex items-center gap-2">
              <div className="w-2 h-2 bg-red-400 rounded-full glow-accent-red"></div>
              {this.props.fallbackTitle || 'Erro no Componente'}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-red-500/20 to-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="h-6 w-6 text-red-400" />
              </div>
              <h4 className="text-lg font-semibold text-text-primary mb-2">Erro ao Carregar Gráfico</h4>
              <p className="text-sm text-text-secondary mb-4">
                Ocorreu um erro inesperado ao renderizar este componente.
              </p>
              <div className="text-xs text-red-400 mb-4 font-mono bg-red-500/10 p-2 rounded">
                {this.state.error?.message || 'Erro desconhecido'}
              </div>
              <Button
                onClick={this.handleRetry}
                variant="outline"
                size="sm"
                className="border-red-500/40 text-red-400 hover:bg-red-500/10"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Tentar Novamente
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}
