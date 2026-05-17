// ============================================
// database.js — Camada de acesso ao Supabase
// ============================================
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

// Inicializa o cliente Supabase
const supabase = createClient(config.supabaseUrl, config.supabaseKey);

/**
 * Inicializa o banco de dados.
 * Verifica se a tabela voice_metrics existe tentando uma query de teste.
 * A tabela deve ser criada previamente no painel do Supabase (veja README).
 */
export async function initDatabase() {
  try {
    const { data, error } = await supabase
      .from('voice_metrics')
      .select('user_id')
      .limit(1);

    if (error) {
      console.error('❌ Erro ao conectar com Supabase:', error.message);
      console.error('   Verifique se a tabela "voice_metrics" foi criada no Supabase.');
      console.error('   Execute o SQL fornecido no README para criar a tabela.');
      process.exit(1);
    }

    console.log('✅ Conexão com Supabase estabelecida com sucesso.');
    return true;
  } catch (err) {
    console.error('❌ Falha crítica ao conectar com Supabase:', err.message);
    process.exit(1);
  }
}

/**
 * Busca ou cria um registro de métricas para o usuário.
 * Usa upsert para garantir atomicidade.
 * @param {string} userId - ID do usuário Discord
 * @param {string} username - Nome de exibição do usuário
 * @returns {Object} Registro do usuário
 */
export async function getOrCreateUser(userId, username) {
  // Primeiro tenta buscar o usuário existente
  const { data: existing, error: fetchError } = await supabase
    .from('voice_metrics')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (existing) return existing;

  // Se não existe, cria com valores padrão
  const { data, error } = await supabase
    .from('voice_metrics')
    .upsert({
      user_id: userId,
      username: username,
      total_presence_time: 0,
      total_speaking_time: 0,
      last_connected: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    console.error(`❌ Erro ao criar/buscar usuário ${username}:`, error.message);
    return null;
  }

  return data;
}

/**
 * Adiciona tempo de presença ao total acumulado do usuário.
 * Usa incremento atômico via RPC ou update direto.
 * @param {string} userId - ID do usuário
 * @param {string} username - Nome de exibição
 * @param {number} seconds - Segundos a adicionar
 */
export async function addPresenceTime(userId, username, seconds) {
  if (seconds <= 0) return;

  // Busca o valor atual
  const user = await getOrCreateUser(userId, username);
  if (!user) return;

  const newTotal = (user.total_presence_time || 0) + Math.floor(seconds);

  const { error } = await supabase
    .from('voice_metrics')
    .update({
      total_presence_time: newTotal,
      username: username, // Atualiza o nome caso tenha mudado
      last_connected: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    console.error(`❌ Erro ao salvar presença de ${username}:`, error.message);
  }
}

/**
 * Adiciona tempo de fala ao total acumulado do usuário.
 * @param {string} userId - ID do usuário
 * @param {string} username - Nome de exibição
 * @param {number} seconds - Segundos a adicionar
 */
export async function addSpeakingTime(userId, username, seconds) {
  if (seconds <= 0) return;

  const user = await getOrCreateUser(userId, username);
  if (!user) return;

  const newTotal = (user.total_speaking_time || 0) + Math.floor(seconds);

  const { error } = await supabase
    .from('voice_metrics')
    .update({
      total_speaking_time: newTotal,
      username: username,
    })
    .eq('user_id', userId);

  if (error) {
    console.error(`❌ Erro ao salvar tempo de fala de ${username}:`, error.message);
  }
}

/**
 * Busca as métricas de um usuário específico.
 * @param {string} userId - ID do usuário
 * @returns {Object|null} Métricas do usuário ou null se não encontrado
 */
export async function getUserMetrics(userId) {
  const { data, error } = await supabase
    .from('voice_metrics')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) return null;
  return data;
}

/**
 * Busca o Top N usuários com mais tempo de fala.
 * @param {number} limit - Quantidade de resultados (padrão: 10)
 * @returns {Array} Lista ordenada de usuários
 */
export async function getTopSpeakers(limit = 10) {
  const { data, error } = await supabase
    .from('voice_metrics')
    .select('*')
    .gt('total_speaking_time', 0)
    .order('total_speaking_time', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('❌ Erro ao buscar top speakers:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Salva uma sessão histórica de voz na tabela voice_sessions.
 * @param {Object} sessionData - Dados da sessão
 * @param {string} sessionData.userId - ID do usuário
 * @param {string} sessionData.username - Nome do usuário
 * @param {string} sessionData.channelId - ID do canal de voz
 * @param {number} sessionData.joinedAt - Timestamp de entrada (ms)
 * @param {number} sessionData.leftAt - Timestamp de saída (ms)
 * @param {number} sessionData.presenceSeconds - Tempo de presença (segundos)
 * @param {number} sessionData.speakingSeconds - Tempo de fala (segundos)
 */
export async function saveVoiceSession({
  userId,
  username,
  channelId,
  joinedAt,
  leftAt,
  presenceSeconds,
  speakingSeconds,
}) {
  const { error } = await supabase
    .from('voice_sessions')
    .insert({
      user_id: userId,
      username: username,
      channel_id: channelId,
      joined_at: new Date(joinedAt).toISOString(),
      left_at: new Date(leftAt).toISOString(),
      presence_seconds: Math.floor(presenceSeconds),
      speaking_seconds: Math.floor(speakingSeconds),
    });

  if (error) {
    console.error(`❌ Erro ao salvar sessão de voz no histórico de ${username}:`, error.message);
  }
}

/**
 * Busca o Top N usuários ordenados por Nível/XP acumulado.
 * @param {number} limit - Quantidade de resultados (padrão: 10)
 * @returns {Array} Lista ordenada de usuários com dados de XP agregados
 */
export async function getTopLevels(limit = 10) {
  const { data, error } = await supabase
    .from('voice_metrics')
    .select('*');

  if (error) {
    console.error('❌ Erro ao buscar top levels:', error.message);
    return [];
  }

  // Mapeia e calcula o XP de cada um em memória
  const calculated = (data || []).map(user => {
    const presence = user.total_presence_time || 0;
    const speaking = user.total_speaking_time || 0;
    const xp = Math.floor((speaking * 3) + (presence * 1));
    return { ...user, xp };
  });

  // Ordena por XP decrescente e limita ao valor solicitado
  return calculated
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit);
}

export { supabase };
