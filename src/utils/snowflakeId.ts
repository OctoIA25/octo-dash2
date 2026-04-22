/**
 * Gerador de Snowflake ID
 * IDs únicos baseados em timestamp que duram 1 dia
 */

const EPOCH = 1704067200000; // 1 de Janeiro de 2024 00:00:00 UTC
const SEQUENCE_BITS = 12;
const MACHINE_ID_BITS = 10;

let sequence = 0;
let lastTimestamp = -1;

// ID da máquina (pode ser baseado em localStorage para consistência)
const getMachineId = (): number => {
  const stored = localStorage.getItem('machine_id');
  if (stored) {
    return parseInt(stored, 10);
  }
  const newId = Math.floor(Math.random() * (1 << MACHINE_ID_BITS));
  localStorage.setItem('machine_id', newId.toString());
  return newId;
};

const machineId = getMachineId();

/**
 * Gera um Snowflake ID único
 * Formato: timestamp (42 bits) + machine_id (10 bits) + sequence (12 bits)
 */
export const generateSnowflakeId = (): string => {
  let timestamp = Date.now() - EPOCH;

  if (timestamp === lastTimestamp) {
    sequence = (sequence + 1) & ((1 << SEQUENCE_BITS) - 1);
    if (sequence === 0) {
      // Aguardar próximo milissegundo
      while (timestamp <= lastTimestamp) {
        timestamp = Date.now() - EPOCH;
      }
    }
  } else {
    sequence = 0;
  }

  lastTimestamp = timestamp;

  // Combinar: timestamp (42 bits) + machine_id (10 bits) + sequence (12 bits)
  const id = (BigInt(timestamp) << BigInt(MACHINE_ID_BITS + SEQUENCE_BITS)) |
             (BigInt(machineId) << BigInt(SEQUENCE_BITS)) |
             BigInt(sequence);

  return id.toString();
};

/**
 * Obtém ou cria um Snowflake ID de sessão diário
 * O ID é renovado a cada dia
 */
export const getDailySessionId = (): string => {
  const today = new Date().toDateString();
  const storedData = localStorage.getItem('daily_session_id');
  
  if (storedData) {
    try {
      const { date, id } = JSON.parse(storedData);
      if (date === today) {
        return id;
      }
    } catch (e) {
      console.error('Erro ao parsear session ID:', e);
    }
  }
  
  // Gerar novo ID para hoje
  const newId = generateSnowflakeId();
  localStorage.setItem('daily_session_id', JSON.stringify({ date: today, id: newId }));
  return newId;
};

/**
 * Extrai o timestamp de um Snowflake ID
 */
export const getTimestampFromSnowflake = (id: string): Date => {
  const timestamp = Number(BigInt(id) >> BigInt(MACHINE_ID_BITS + SEQUENCE_BITS));
  return new Date(timestamp + EPOCH);
};

