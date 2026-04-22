/**
 * Página que abre o modal de Resultados Gerais dos Testes
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminResultadosGerais } from '../components/AdminResultadosGerais';

export const AdminTestesGeraisPage = () => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Abrir o modal automaticamente ao carregar a página
    setIsOpen(true);
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    // Voltar para a página anterior após fechar
    setTimeout(() => {
      navigate(-1);
    }, 200);
  };

  return (
    <AdminResultadosGerais 
      isOpen={isOpen} 
      onClose={handleClose} 
    />
  );
};

