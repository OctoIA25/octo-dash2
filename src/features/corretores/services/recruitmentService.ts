import { supabase } from '@/lib/supabaseClient';

// Define types inline since we don't have a separate database types file
export interface Database {
  public: {
    Tables: {
      recruitment_candidates: {
        Row: {
          id: string;
          tenant_id: string;
          nome: string;
          email: string;
          telefone?: string;
          cargo: string;
          experiencia?: string;
          linkedin?: string;
          curriculo?: string;
          observacoes?: string;
          status: 'Lead' | 'Interação' | 'Reunião' | 'Onboard' | 'Aprovado' | 'Rejeitado';
          data_inscricao: string;
          created_at: string;
          updated_at: string;
          created_by?: string;
          fonte: string;
        };
        Insert: Omit<Database['public']['Tables']['recruitment_candidates']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['recruitment_candidates']['Insert']>;
      };
      recruitment_stages: {
        Row: {
          id: string;
          candidate_id: string;
          tenant_id: string;
          etapa: string;
          data: string;
          responsavel?: string;
          notas?: string;
          created_at: string;
          updated_at: string;
          created_by?: string;
        };
        Insert: Omit<Database['public']['Tables']['recruitment_stages']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['recruitment_stages']['Insert']>;
      };
    };
  };
}

type Candidato = Database['public']['Tables']['recruitment_candidates']['Row'];
type CandidatoInsert = Database['public']['Tables']['recruitment_candidates']['Insert'];
type CandidatoUpdate = Database['public']['Tables']['recruitment_candidates']['Update'];
type Etapa = Database['public']['Tables']['recruitment_stages']['Row'];
type EtapaInsert = Database['public']['Tables']['recruitment_stages']['Insert'];

export interface CandidatoComEtapas extends Candidato {
  etapas: Etapa[];
}

export interface RecruitmentMetrics {
  total_candidates: number;
  lead_count: number;
  interaction_count: number;
  meeting_count: number;
  onboard_count: number;
  approved_count: number;
  rejected_count: number;
  conversion_rate: number;
  avg_process_days: number;
  tempoMedioProcesso: number;
  taxaRetencao: number;
  custoPorContratacao: number;
}

export interface SearchParams {
  query?: string;
  status?: string;
  cargo?: string;
  experiencia?: string;
  limit?: number;
  offset?: number;
}

export class RecruitmentService {
  private supabase;

  constructor() {
    this.supabase = supabase;
  }

  // CRUD Operations
  async getCandidatos(params: SearchParams = {}): Promise<{ data: CandidatoComEtapas[]; count: number }> {
    const {
      query = '',
      status,
      cargo,
      experiencia,
      limit = 50,
      offset = 0
    } = params;

    try {
      // Build search query
      let searchQuery = this.supabase
        .from('recruitment_candidates')
        .select(`
          *,
          recruitment_stages (
            id,
            etapa,
            data,
            responsavel,
            notas,
            created_at,
            updated_at
          )
        `, { count: 'exact' });

      // Apply filters
      if (query) {
        searchQuery = searchQuery.or(`nome.ilike.%${query}%,email.ilike.%${query}%,cargo.ilike.%${query}%`);
      }
      if (status) {
        searchQuery = searchQuery.eq('status', status);
      }
      if (cargo) {
        searchQuery = searchQuery.eq('cargo', cargo);
      }
      if (experiencia) {
        searchQuery = searchQuery.eq('experiencia', experiencia);
      }

      // Apply pagination and ordering
      const { data, error, count } = await searchQuery
        .order('data_inscricao', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      // Transform data to include etapas as array
      const candidatosComEtapas = data?.map(candidato => ({
        ...candidato,
        etapas: candidato.recruitment_stages || []
      })) || [];

      return { data: candidatosComEtapas, count: count || 0 };
    } catch (error) {
      console.error('Error fetching candidates:', error);
      throw error;
    }
  }

  async getCandidatoById(id: string): Promise<CandidatoComEtapas | null> {
    try {
      const { data, error } = await this.supabase
        .from('recruitment_candidates')
        .select(`
          *,
          recruitment_stages (
            id,
            etapa,
            data,
            responsavel,
            notas,
            created_at,
            updated_at
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) return null;

      return {
        ...data,
        etapas: data.recruitment_stages || []
      };
    } catch (error) {
      console.error('Error fetching candidate by ID:', error);
      throw error;
    }
  }

  async createCandidato(candidato: CandidatoInsert): Promise<Candidato> {
    try {
      const { data, error } = await this.supabase
        .from('recruitment_candidates')
        .insert(candidato)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating candidate:', error);
      throw error;
    }
  }

  async updateCandidato(id: string, updates: CandidatoUpdate): Promise<Candidato> {
    try {
      const { data, error } = await this.supabase
        .from('recruitment_candidates')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating candidate:', error);
      throw error;
    }
  }

  async deleteCandidato(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('recruitment_candidates')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting candidate:', error);
      throw error;
    }
  }

  // Stage Management
  async addEtapa(candidateId: string, etapa: EtapaInsert): Promise<Etapa> {
    try {
      const { data, error } = await this.supabase
        .from('recruitment_stages')
        .insert({ ...etapa, candidate_id: candidateId })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error adding stage:', error);
      throw error;
    }
  }

  async updateEtapa(id: string, updates: Partial<EtapaInsert>): Promise<Etapa> {
    try {
      const { data, error } = await this.supabase
        .from('recruitment_stages')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating stage:', error);
      throw error;
    }
  }

  async deleteEtapa(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('recruitment_stages')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting stage:', error);
      throw error;
    }
  }

  // Metrics and Analytics
  async getMetrics(): Promise<RecruitmentMetrics> {
    try {
      const { data, error } = await this.supabase
        .rpc('get_recruitment_metrics');

      if (error) throw error;
      return data?.[0] || {
        total_candidates: 0,
        lead_count: 0,
        interaction_count: 0,
        meeting_count: 0,
        onboard_count: 0,
        approved_count: 0,
        rejected_count: 0,
        conversion_rate: 0,
        avg_process_days: 0
      };
    } catch (error) {
      console.error('Error fetching metrics:', error);
      throw error;
    }
  }

  async getCandidatesByStatus(): Promise<Record<string, number>> {
    try {
      const { data, error } = await this.supabase
        .from('recruitment_candidates')
        .select('status')
        .order('status');

      if (error) throw error;

      const statusCounts: Record<string, number> = {};
      data?.forEach(candidato => {
        statusCounts[candidato.status] = (statusCounts[candidato.status] || 0) + 1;
      });

      return statusCounts;
    } catch (error) {
      console.error('Error fetching candidates by status:', error);
      throw error;
    }
  }

  async getCandidatesByCargo(): Promise<Record<string, number>> {
    try {
      const { data, error } = await this.supabase
        .from('recruitment_candidates')
        .select('cargo')
        .order('cargo');

      if (error) throw error;

      const cargoCounts: Record<string, number> = {};
      data?.forEach(candidato => {
        cargoCounts[candidato.cargo] = (cargoCounts[candidato.cargo] || 0) + 1;
      });

      return cargoCounts;
    } catch (error) {
      console.error('Error fetching candidates by cargo:', error);
      throw error;
    }
  }

  async getMonthlyMetrics(year: number = new Date().getFullYear()): Promise<any[]> {
    try {
      const startDate = new Date(year, 0, 1).toISOString();
      const endDate = new Date(year, 11, 31, 23, 59, 59).toISOString();

      const { data, error } = await this.supabase
        .from('recruitment_candidates')
        .select('data_inscricao, status')
        .gte('data_inscricao', startDate)
        .lte('data_inscricao', endDate)
        .order('data_inscricao');

      if (error) throw error;

      // Group by month
      const monthlyData: Record<string, { candidates: number; hired: number }> = {};
      
      data?.forEach(candidato => {
        const month = new Date(candidato.data_inscricao).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        
        if (!monthlyData[month]) {
          monthlyData[month] = { candidates: 0, hired: 0 };
        }
        
        monthlyData[month].candidates++;
        if (candidato.status === 'Aprovado') {
          monthlyData[month].hired++;
        }
      });

      return Object.entries(monthlyData).map(([month, stats]) => ({
        mes: month,
        candidatos: stats.candidates,
        contratados: stats.hired,
        taxa: stats.candidates > 0 ? ((stats.hired / stats.candidates) * 100).toFixed(1) : '0'
      }));
    } catch (error) {
      console.error('Error fetching monthly metrics:', error);
      throw error;
    }
  }

  // Status change operations
  async changeCandidateStatus(
    candidateId: string, 
    newStatus: string, 
    responsavel?: string, 
    notas?: string
  ): Promise<Candidato> {
    try {
      // Update candidate status
      const { data: candidato, error: updateError } = await this.supabase
        .from('recruitment_candidates')
        .update({ status: newStatus })
        .eq('id', candidateId)
        .select()
        .single();

      if (updateError) throw updateError;

      // Add new stage entry
      if (newStatus !== 'Lead') {
        await this.supabase
          .from('recruitment_stages')
          .insert({
            candidate_id: candidateId,
            tenant_id: candidato.tenant_id,
            etapa: newStatus,
            data: new Date().toISOString(),
            responsavel: responsavel || 'Sistema',
            notas: notas || `Status alterado para ${newStatus}`
          });
      }

      return candidato;
    } catch (error) {
      console.error('Error changing candidate status:', error);
      throw error;
    }
  }

  // Bulk operations
  async bulkUpdateStatus(candidateIds: string[], newStatus: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('recruitment_candidates')
        .update({ status: newStatus })
        .in('id', candidateIds);

      if (error) throw error;
    } catch (error) {
      console.error('Error bulk updating status:', error);
      throw error;
    }
  }

  // Fontes de Candidatos
  async getCandidateSources(): Promise<Record<string, number>> {
    try {
      // Agora usando o campo 'fonte' direto da tabela
      const { data, error } = await this.supabase
        .from('recruitment_candidates')
        .select('fonte, created_at');

      if (error) throw error;

      const sources: Record<string, number> = {};
      
      data?.forEach(candidato => {
        const source = candidato.fonte || 'Outros';
        sources[source] = (sources[source] || 0) + 1;
      });

      return sources;
    } catch (error) {
      console.error('Error fetching candidate sources:', error);
      throw error;
    }
  }

  async bulkDelete(candidateIds: string[]): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('recruitment_candidates')
        .delete()
        .in('id', candidateIds);

      if (error) throw error;
    } catch (error) {
      console.error('Error bulk deleting candidates:', error);
      throw error;
    }
  }

  // Calcular métricas avançadas
  async getAdvancedMetrics(): Promise<RecruitmentMetrics> {
    try {
      const { data: candidates, error } = await this.supabase
        .from('recruitment_candidates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!candidates || candidates.length === 0) {
        return {
          total_candidates: 0,
          lead_count: 0,
          interaction_count: 0,
          meeting_count: 0,
          onboard_count: 0,
          approved_count: 0,
          rejected_count: 0,
          conversion_rate: 0,
          avg_process_days: 0,
          tempoMedioProcesso: 0,
          taxaRetencao: 0,
          custoPorContratacao: 0
        };
      }

      // Contagem por status
      const leadCount = candidates.filter(c => c.status === 'Lead').length;
      const interactionCount = candidates.filter(c => c.status === 'Interação').length;
      const meetingCount = candidates.filter(c => c.status === 'Reunião').length;
      const onboardCount = candidates.filter(c => c.status === 'Onboard').length;
      const approvedCount = candidates.filter(c => c.status === 'Aprovado').length;
      const rejectedCount = candidates.filter(c => c.status === 'Rejeitado').length;

      // Calcular tempo médio de processo
      const processTimes: number[] = [];
      candidates.forEach(candidate => {
        if (candidate.status === 'Onboard' && candidate.created_at) {
          const createdDate = new Date(candidate.created_at);
          const now = new Date();
          const daysDiff = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
          processTimes.push(daysDiff);
        }
      });

      const tempoMedioProcesso = processTimes.length > 0 
        ? Math.round(processTimes.reduce((a, b) => a + b, 0) / processTimes.length)
        : 0; // Retorna 0 se não houver candidatos onboarded

      // Calcular taxa de retenção (simulação - 85% dos onboard)
      const taxaRetencao = onboardCount > 0 ? 85 : 0;

      // Calcular custo por contratação (simulação - R$ 1.2k por onboard)
      const custoPorContratacao = 1.2;

      return {
        total_candidates: candidates.length,
        lead_count: leadCount,
        interaction_count: interactionCount,
        meeting_count: meetingCount,
        onboard_count: onboardCount,
        approved_count: approvedCount,
        rejected_count: rejectedCount,
        conversion_rate: candidates.length > 0 ? Math.round((onboardCount / candidates.length) * 100) : 0,
        avg_process_days: tempoMedioProcesso,
        tempoMedioProcesso,
        taxaRetencao,
        custoPorContratacao
      };
    } catch (error) {
      console.error('Error calculating advanced metrics:', error);
      throw error;
    }
  }
}

// Singleton instance
export const recruitmentService = new RecruitmentService();
