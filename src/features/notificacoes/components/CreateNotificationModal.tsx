import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Textarea } from '@/components/ui/textarea';
import { CORRETORES_DATA } from '@/hooks/useAuth';

interface CreateNotificationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateNotification: (data: {
    title: string;
    sender: string;
    recipient: string;
    description: string;
  }) => Promise<void>;
}

export const CreateNotificationModal = ({
  open,
  onOpenChange,
  onCreateNotification,
}: CreateNotificationModalProps) => {
  const [title, setTitle] = useState('');
  const [sender, setSender] = useState('');
  const [recipient, setRecipient] = useState<string>('Geral');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || !sender.trim() || !description.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreateNotification({
        title: title.trim(),
        sender: sender.trim(),
        recipient: recipient,
        description: description.trim(),
      });
      
      // Reset form
      setTitle('');
      setSender('');
      setRecipient('Geral');
      setDescription('');
      onOpenChange(false);
    } catch (error) {
      console.error('Erro ao criar notificação:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Gerar Nova Notificação</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              placeholder="Digite o título da notificação"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sender">Quem enviou *</Label>
            <Input
              id="sender"
              placeholder="Nome do remetente"
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              disabled={isSubmitting}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="recipient">Enviar para *</Label>
            <Select value={recipient} onValueChange={setRecipient} disabled={isSubmitting}>
              <SelectTrigger id="recipient">
                <SelectValue placeholder="Selecione o destinatário" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Geral">Geral (Toda a plataforma)</SelectItem>
                <SelectItem value="Todos os Corretores">Todos os Corretores</SelectItem>
                {CORRETORES_DATA.map((corretor) => (
                  <SelectItem key={corretor.nome} value={corretor.nome}>
                    {corretor.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição *</Label>
            <Textarea
              id="description"
              placeholder="Digite a descrição da notificação"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
              required
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Enviando...' : 'Enviar Notificação'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
