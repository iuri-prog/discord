// ============================================
// database.js — Camada de acesso ao Supabase
// ============================================
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import fs from 'fs';
import path from 'path';

// Inicializa o cliente Supabase
const supabase = createClient(config.supabaseUrl, config.supabaseKey);

/**
 * Remove qualquer tag de conquista [+x] e emojis do nome do usuário.
 * @param {string} name - Nome original
 * @returns {string} Nome limpo
 */
function cleanUsername(name) {
  if (!name) return '';
  return name
    .replace(/\[\+\s*\d+\]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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
  const cleaned = cleanUsername(username) || userId;
  // Primeiro tenta buscar o usuário existente
  const { data: existing, error: fetchError } = await supabase
    .from('voice_metrics')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (existing) {
    // Se o username mudou, atualiza no banco (sempre limpando tags/emojis)
    if (existing.username !== cleaned) {
      await supabase
        .from('voice_metrics')
        .update({ username: cleaned })
        .eq('user_id', userId);
      existing.username = cleaned;
    }
    return existing;
  }

  // Se não existe, cria com valores padrão (sempre limpando tags/emojis)
  const { data, error } = await supabase
    .from('voice_metrics')
    .upsert({
      user_id: userId,
      username: cleaned,
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

/**
 * Concede uma nova patente/badge (loot drop) para um usuário no banco de dados.
 * @param {string} userId - ID do usuário
 * @param {string} username - Nome do usuário
 * @param {string} badgeIcon - Ícone/Emoji da Badge
 * @param {string} badgeName - Nome da Badge
 * @param {string} badgeTag - Tag associada (ex: [Coruja])
 */
export async function awardBadge(userId, username, badgeIcon, badgeName, badgeTag) {
  const { error } = await supabase
    .from('user_badges')
    .insert({
      user_id: userId,
      username: username,
      badge_icon: badgeIcon,
      badge_name: badgeName
      // badge_tag removido pois não existia no schema original do CREATE TABLE
    });

  if (error) {
    console.error(`❌ Erro ao conceder badge para ${username}:`, error.message);
  }
}

/**
 * Busca todas as badges de um usuário.
 * @param {string} userId - ID do usuário
 * @returns {Array} Lista de badges do usuário
 */
export async function getUserBadges(userId) {
  const { data, error } = await supabase
    .from('user_badges')
    .select('*')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false });

  if (error) {
    console.error(`❌ Erro ao buscar badges do usuário ${userId}:`, error.message);
    return [];
  }
  return data || [];
}

let cachedRarityStats = {};
let lastStatsFetchTime = 0;

/**
 * Busca estatísticas de posse (raridade) das conquistas no banco de dados.
 * Conta o número de ocorrências de cada badge_name globalmente.
 * @param {boolean} force - Se true, força o recarregamento dos dados ignorando o cache
 * @returns {Promise<Object>} Um objeto mapeando badge_name para o número total de ocorrências.
 */
export async function getBadgeRarityStats(force = false) {
  const now = Date.now();
  // Cache de 5 minutos para evitar chamadas excessivas ao Supabase
  if (!force && now - lastStatsFetchTime < 5 * 60 * 1000 && Object.keys(cachedRarityStats).length > 0) {
    return cachedRarityStats;
  }

  try {
    const { data, error } = await supabase
      .from('user_badges')
      .select('badge_name');

    if (error) throw error;

    const counts = {};
    if (data) {
      data.forEach(row => {
        counts[row.badge_name] = (counts[row.badge_name] || 0) + 1;
      });
    }

    cachedRarityStats = counts;
    lastStatsFetchTime = now;
    return counts;
  } catch (err) {
    console.error('❌ [DB] Erro ao buscar estatísticas de raridade:', err.message);
    return cachedRarityStats || {};
  }
}


/**
 * Encontra o melhor amigo do usuário cruzando os overlaps de sessões.
 * @param {string} userId - ID do usuário
 * @returns {Object|null} Objeto contendo o melhor amigo ou null
 */
export async function getBestFriend(userId) {
  // Puxa todas as sessões. Em produção com milhares de registros, seria melhor usar uma RPC no Supabase.
  const { data: allSessions, error } = await supabase
    .from('voice_sessions')
    .select('user_id, username, channel_id, joined_at, left_at')
    .not('left_at', 'is', null);

  if (error || !allSessions) return null;

  const userSessions = allSessions.filter(s => s.user_id === userId);
  if (userSessions.length === 0) return null;

  const overlapMap = {}; // userId -> overlapTime

  userSessions.forEach(mySession => {
    const myStart = new Date(mySession.joined_at).getTime();
    const myEnd = new Date(mySession.left_at).getTime();

    // Filtra pessoas que estavam no mesmo canal que eu, mas que não sou eu
    const otherSessions = allSessions.filter(s => 
      s.channel_id === mySession.channel_id && 
      s.user_id !== userId
    );

    otherSessions.forEach(otherSession => {
      const otherStart = new Date(otherSession.joined_at).getTime();
      const otherEnd = new Date(otherSession.left_at).getTime();

      const overlapStart = Math.max(myStart, otherStart);
      const overlapEnd = Math.min(myEnd, otherEnd);
      const overlap = (overlapEnd - overlapStart) / 1000;

      if (overlap > 0) {
        if (!overlapMap[otherSession.user_id]) {
          overlapMap[otherSession.user_id] = { username: otherSession.username, time: 0 };
        }
        overlapMap[otherSession.user_id].time += overlap;
      }
    });
  });

  let bestFriend = null;
  let maxTime = 0;
  for (const [id, data] of Object.entries(overlapMap)) {
    if (data.time > maxTime) {
      maxTime = data.time;
      bestFriend = { id, username: data.username, time: data.time };
    }
  }

  return bestFriend;
}

/**
 * Retorna as moedas e bônus de XP do usuário
 */
export async function getEconomy(userId) {
  const { data, error } = await supabase
    .from('voice_metrics')
    .select('voice_coins, bonus_xp')
    .eq('user_id', userId)
    .single();
  if (error || !data) return { voice_coins: 0, bonus_xp: 0 };
  return data;
}

/**
 * Adiciona moedas e bônus de XP ao usuário
 */
export async function addEconomy(userId, username, coins = 0, bonusXp = 0) {
  if (coins === 0 && bonusXp === 0) return;
  const user = await getOrCreateUser(userId, username);
  if (!user) return;
  
  const { error } = await supabase
    .from('voice_metrics')
    .update({
      voice_coins: (user.voice_coins || 0) + coins,
      bonus_xp: (user.bonus_xp || 0) + bonusXp,
      username: username
    })
    .eq('user_id', userId);
    
  if (error) console.error(`❌ Erro ao adicionar economia para ${username}:`, error.message);
}

/**
 * Deduz moedas do usuário (retorna true se teve saldo, false se não)
 */
export async function spendCoins(userId, amount) {
  const user = await getOrCreateUser(userId, 'Unknown');
  if (!user || (user.voice_coins || 0) < amount) return false;
  
  const { error } = await supabase
    .from('voice_metrics')
    .update({
      voice_coins: user.voice_coins - amount
    })
    .eq('user_id', userId);
    
  if (error) {
    console.error(`❌ Erro ao gastar moedas de ${userId}:`, error.message);
    return false;
  }
  return true;
}

// ============================================
// SISTEMA DE CITAÇÕES / CLONAGEM DE FRASES
// ============================================

const localQuotesPath = path.resolve('quotes.json');

/**
 * Lê frases do arquivo local quotes.json (fallback).
 */
async function getLocalQuotes() {
  try {
    if (!fs.existsSync(localQuotesPath)) {
      await fs.promises.writeFile(localQuotesPath, JSON.stringify([], null, 2));
      return [];
    }
    const content = await fs.promises.readFile(localQuotesPath, 'utf8');
    return JSON.parse(content) || [];
  } catch (err) {
    console.error('⚠️ [DB] Erro ao ler quotes locais:', err.message);
    return [];
  }
}

/**
 * Salva frase no arquivo local quotes.json (fallback).
 */
async function saveLocalQuote(author, phrase) {
  try {
    const quotes = await getLocalQuotes();
    quotes.push({ author, phrase, created_at: new Date().toISOString() });
    await fs.promises.writeFile(localQuotesPath, JSON.stringify(quotes, null, 2));
    return true;
  } catch (err) {
    console.error('⚠️ [DB] Erro ao salvar quote local:', err.message);
    return false;
  }
}

/**
 * Salva uma citação clonada de um usuário.
 * Tenta usar o Supabase, se falhar ou a tabela não existir, usa o fallback local (JSON).
 */
export async function saveQuote(author, phrase) {
  try {
    const { error } = await supabase
      .from('user_quotes')
      .insert({ author, phrase });

    if (error) {
      console.warn('⚠️ [DB] Supabase falhou ao salvar quote, usando fallback local:', error.message);
      return await saveLocalQuote(author, phrase);
    }
    return true;
  } catch (err) {
    console.warn('⚠️ [DB] Erro ao conectar ao Supabase para salvar quote, usando fallback local:', err.message);
    return await saveLocalQuote(author, phrase);
  }
}

/**
 * Busca uma citação aleatória.
 * Tenta usar o Supabase, se falhar ou a tabela não existir, usa o fallback local (JSON).
 */
export async function getRandomQuote() {
  try {
    const { data, error } = await supabase
      .from('user_quotes')
      .select('*');

    if (error || !data || data.length === 0) {
      if (error) {
        console.warn('⚠️ [DB] Supabase falhou ao buscar quotes, usando fallback local:', error.message);
      }
      const local = await getLocalQuotes();
      if (local.length === 0) return null;
      return local[Math.floor(Math.random() * local.length)];
    }
    
    return data[Math.floor(Math.random() * data.length)];
  } catch (err) {
    console.warn('⚠️ [DB] Erro de rede no Supabase, usando fallback local:', err.message);
    const local = await getLocalQuotes();
    if (local.length === 0) return null;
    return local[Math.floor(Math.random() * local.length)];
  }
}

/**
 * Atualiza o username/nickname do usuário no banco de dados nas tabelas voice_metrics e user_badges.
 * @param {string} userId - ID do usuário Discord
 * @param {string} newUsername - Novo username/nickname
 */
export async function updateDatabaseUsername(userId, newUsername) {
  const cleaned = cleanUsername(newUsername) || userId;
  try {
    // 1. Atualiza na tabela voice_metrics
    const { error: metricsError } = await supabase
      .from('voice_metrics')
      .update({ username: cleaned })
      .eq('user_id', userId);

    if (metricsError) {
      console.error(`❌ [DB] Erro ao atualizar username na voice_metrics para ${userId}:`, metricsError.message);
    }

    // 2. Atualiza na tabela user_badges
    const { error: badgesError } = await supabase
      .from('user_badges')
      .update({ username: cleaned })
      .eq('user_id', userId);

    if (badgesError) {
      console.error(`❌ [DB] Erro ao atualizar username na user_badges para ${userId}:`, badgesError.message);
    }

    console.log(`💾 [DB SYNC] Username do usuário ${userId} atualizado para "${cleaned}" no banco de dados.`);
  } catch (err) {
    console.error(`❌ [DB] Erro ao sincronizar username de ${userId} no banco:`, err.message);
  }
}

/**
 * Busca todas as conquistas do banco agrupadas por user_id.
 * @returns {Promise<Object>} Um objeto mapeando user_id para um array de conquistas do usuário.
 */
export async function getAllUserBadgesMap() {
  try {
    const { data, error } = await supabase
      .from('user_badges')
      .select('*');

    if (error) throw error;

    const map = {};
    if (data) {
      data.forEach(b => {
        if (!map[b.user_id]) {
          map[b.user_id] = [];
        }
        map[b.user_id].push(b);
      });
    }
    return map;
  } catch (err) {
    console.error('❌ [DB] Erro ao carregar mapa global de badges:', err.message);
    return {};
  }
}

export { supabase };


