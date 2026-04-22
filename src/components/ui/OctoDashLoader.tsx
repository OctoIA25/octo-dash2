interface OctoDashLoaderProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const OctoDashLoader = ({ message = 'Carregando...', size = 'md' }: OctoDashLoaderProps) => {
  const sizes = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-20 h-20'
  };

  const spinnerSizes = {
    sm: 'w-14 h-14',
    md: 'w-18 h-18',
    lg: 'w-24 h-24'
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      {/* Logo do OctoDash com spinner ao redor - OTIMIZADO */}
      <div className="relative flex items-center justify-center">
        {/* Spinner animado - SUPER RÁPIDO e LEVE */}
        <div 
          className={`absolute ${spinnerSizes[size]} border-2 border-transparent border-t-blue-500 rounded-full`}
          style={{ 
            animation: 'spin 0.6s linear infinite',
            willChange: 'transform',
            transform: 'translateZ(0)', // GPU acceleration
            backfaceVisibility: 'hidden' // Otimização de rendering
          }}
        ></div>
        
        {/* Logo do OctoDash - SEM animação pesada */}
        <div className={`${sizes[size]} flex items-center justify-center relative z-10`}>
          <img 
            src="https://i.ibb.co/tTQwnPKF/Octo-Dash-Logo-removebg-preview.png"
            alt="OctoDash"
            className="w-full h-full object-contain opacity-90"
            loading="eager"
            decoding="async"
          />
        </div>
      </div>

      {/* Texto de loading - simplificado */}
      <div className="text-center">
        <p className="text-text-primary text-base font-medium">{message}</p>
      </div>
    </div>
  );
};

