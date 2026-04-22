import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  const handleGoHome = () => {
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <main className="flex items-center justify-center p-10 min-h-screen">
        <div className="text-center">
          <h1 className="mb-2 text-5xl font-bold text-text-primary">404</h1>
          <p className="mb-6 text-lg text-text-secondary">Página não encontrada</p>
          <Button 
            onClick={handleGoHome}
            variant="outline"
            className="inline-flex items-center gap-2"
          >
            <Home className="h-4 w-4" />
            Voltar ao início
          </Button>
        </div>
      </main>
    </div>
  );
};

export default NotFound;
