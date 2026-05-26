import { supabase } from '@/lib/supabaseClient';

const TENANT_ID = 'e2d9bca4-3ce3-4733-b3ea-ed65ce09c832';
const EXCEL_PATH = '/excel_ler.xlsx';
const PULAR_CABECALHO = true;
const limpar = (valor: unknown) => String(valor ?? '').trim();
const normalizarPhone = (valor: unknown) => String(valor ?? '').replace(/\D/g, '');

function parseDataExcel(valor: unknown) {
    if (!valor) return null;

    if (valor instanceof Date) {
        return valor.toISOString();
    }

    if (typeof valor === 'number') {
        const data = new Date(Date.UTC(1899, 11, 30) + valor * 86400000);
        return isNaN(data.getTime()) ? null : data.toISOString();
    }

    const texto = limpar(valor);
    const data = new Date(texto);

    return Number.isNaN(data.getTime()) ? texto : data.toISOString();
}

export async function importarExcelFunilInteressado() {
    const XLSX = await import('xlsx');
    const response = await fetch(EXCEL_PATH);
    const arrayBuffer = await response.arrayBuffer();

    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const primeiraAba = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[primeiraAba];

    const linhas = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
    }) as unknown[][];

    const linhasParaImportar = PULAR_CABECALHO ? linhas.slice(1) : linhas;
    const agora = new Date().toISOString();

    const leads = linhasParaImportar
        .map((linha) => {
            const received = parseDataExcel(linha[0]);
            const name = limpar(linha[1]);
            const email = limpar(linha[2]) || null;
            const phone = limpar(linha[3]) || null;
            const corretor = limpar(linha[5]) || limpar(linha[4]) || null;

            if (!name && !email && !phone) return null;

            return {
                tenant_id: TENANT_ID,
                name: name || phone || email || 'Lead sem nome',
                phone,
                email,
                source: 'Excel',
                source_lead_id: null,
                status: 'Novos Leads',
                temperature: null,
                property_id: null,
                property_code: null,
                property_value: null,
                property_type: null,
                assigned_agent_id: null,
                assigned_agent_name: corretor,
                comments: received ? `Recebido em: ${received}` : null,
                tags: ['excel_funil_interessado'],
                custom_fields: { excel_received: received },
                visit_date: null,
                closing_date: null,
                final_sale_value: null,
                archived_at: null,
                archive_reason: null,
                lead_type: 1,
                is_exclusive: false,
                participa_bolsao: false,
                assigned_at: received || agora,
                created_at: received || agora,
                updated_at: agora,
            };
        })
        .filter(Boolean);

    const telefonesContagem = new Map<string, any[]>();

    for (const lead of leads) {
        const phoneNormalizado = normalizarPhone(lead.phone);

        if (!phoneNormalizado) continue;

        const lista = telefonesContagem.get(phoneNormalizado) || [];
        lista.push(lead);
        telefonesContagem.set(phoneNormalizado, lista);
    }

    const phonesDuplicadosNoExcel = Array.from(telefonesContagem.entries())
        .filter(([_, lista]) => lista.length > 1);

    const { data: existentes, error: err } = await supabase
        .from('leads')
        .select('*')
        .eq('tenant_id', TENANT_ID)

    if (err) {
        console.error('Erro ao buscar leads existentes:', err);
        return;
    }

    const chavesExistentes = new Set(
        (existentes || []).flatMap((lead) => [
            lead.phone ? `phone:${normalizarPhone(lead.phone)}` : null,
            lead.email ? `email:${limpar(lead.email).toLowerCase()}` : null,
        ]).filter(Boolean)
    );

    const duplicadosNoBanco = leads.filter((lead) => {
        const phoneKey = lead.phone ? `phone:${normalizarPhone(lead.phone)}` : null;
        const emailKey = lead.email ? `email:${limpar(lead.email).toLowerCase()}` : null;

        return (
            (phoneKey && chavesExistentes.has(phoneKey)) ||
            (emailKey && chavesExistentes.has(emailKey))
        );
    });

    console.log('Leads do Excel que ja existem no banco:', duplicadosNoBanco);
    console.table(
        duplicadosNoBanco.map((lead) => ({
            name: lead.name,
            phone: lead.phone,
            phone_normalizado: normalizarPhone(lead.phone),
            email: lead.email,
        }))
    );

    const leadsNovos = leads.filter((lead) => {
        const phoneKey = lead.phone ? `phone:${normalizarPhone(lead.phone)}` : null;
        const emailKey = lead.email ? `email:${limpar(lead.email).toLowerCase()}` : null;

        const jaExiste =
            (phoneKey && chavesExistentes.has(phoneKey)) ||
            (emailKey && chavesExistentes.has(emailKey));

        if (jaExiste) return false;

        if (phoneKey) chavesExistentes.add(phoneKey);
        if (emailKey) chavesExistentes.add(emailKey);

        return true;
    });

    const { data, error } = await supabase
        .from('leads')
        .insert(leadsNovos)
        .select();

    if (error) {
        console.error('Erro ao inserir leads:', error);
        return { success: false, error };
    }

    console.log(`${leads.length - leadsNovos.length} leads ignorados por ja existirem`);
    console.log(`${leadsNovos.length} leads novos para inserir`);
    return { success: true, data };

}


// const m = await import('/src/features/leads/services/excelFunilInteressado.ts')
// await m.importarExcelFunilInteressado()
