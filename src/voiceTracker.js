// ============================================
// voiceTracker.js — Rastreamento de tempo de presença em voz
// ============================================
// Gerencia o rastreamento de quando os usuários entram/saem
// de canais de voz, calculando o tempo total de presença.

import { addPresenceTime, saveVoiceSession } from './database.js';

/**
 * Map em memória para rastrear timestamps de entrada.
 * Chave: userId | Valor: { originalJoinedAt: number, lastFlushedAt: number, username: string, channelId: string, speakingSeconds: number }
 */
const presenceSessions = new Map();

/**
 * Registra a entrada de um usuário em um canal de voz.
 * @param {string} userId - ID do usuário
 * @param {string} username - Nome de exibição
 * @param {string} channelId - ID do canal de voz
 */
export function startPresenceTracking(userId, username, channelId) {
  // Se já existe uma sessão ativa, finaliza a anterior primeiro
  if (presenceSessions.has(userId)) {
    stopPresenceTracking(userId);
  }

  const now = Date.now();
  presenceSessions.set(userId, {
    originalJoinedAt: now,
    lastFlushedAt: now,
    username,
    channelId,
    speakingSeconds: 0, // Acumulador de segundos falados nesta sessão
    thresholdsChecked: new Set(), // Registra quais conquistas de limite de fala foram avaliadas
  });

  console.log(`📥 [PRESENÇA] ${username} entrou no canal de voz (${channelId})`);
}

/**
 * Finaliza o rastreamento de presença e salva no banco de dados (global e sessão).
 * @param {string} userId - ID do usuário
 * @returns {number} Tempo total de presença da sessão em segundos (0 se não havia sessão)
 */
export async function stopPresenceTracking(userId) {
  const session = presenceSessions.get(userId);
  if (!session) return 0;

  const now = Date.now();
  const elapsedSinceLastFlush = (now - session.lastFlushedAt) / 1000;
  const totalSessionPresence = (now - session.originalJoinedAt) / 1000;
  
  presenceSessions.delete(userId);

  // 1. Salva a parte pendente (desde o último flush) nas métricas globais
  if (elapsedSinceLastFlush > 0) {
    await addPresenceTime(userId, session.username, elapsedSinceLastFlush);
  }

  // 2. Salva a sessão histórica completa no banco de dados (histórico)
  await saveVoiceSession({
    userId,
    username: session.username,
    channelId: session.channelId,
    joinedAt: session.originalJoinedAt,
    leftAt: now,
    presenceSeconds: totalSessionPresence,
    speakingSeconds: session.speakingSeconds || 0,
  });

  console.log(
    `📤 [PRESENÇA] ${session.username} saiu. ` +
    `Presença total: ${Math.floor(totalSessionPresence)}s | Fala total: ${Math.floor(session.speakingSeconds || 0)}s`
  );

  return totalSessionPresence;
}

/**
 * Incrementa o tempo de fala acumulado na sessão ativa de um usuário.
 * @param {string} userId - ID do usuário
 * @param {number} seconds - Segundos a adicionar
 */
export function incrementSessionSpeakingTime(userId, seconds) {
  const session = presenceSessions.get(userId);
  if (session) {
    session.speakingSeconds = (session.speakingSeconds || 0) + seconds;
  }
}

/**
 * Verifica se um usuário está sendo rastreado atualmente.
 * @param {string} userId - ID do usuário
 * @returns {boolean}
 */
export function isTracking(userId) {
  return presenceSessions.has(userId);
}

/**
 * Retorna o ID do canal onde o usuário está no momento.
 * @param {string} userId - ID do usuário
 * @returns {string|null} ID do canal ou null se não estiver em nenhum.
 */
export function getSessionChannelId(userId) {
  const session = presenceSessions.get(userId);
  return session ? session.channelId : null;
}

/**
 * Salva todos os dados parciais de presença no banco (failsafe).
 * Útil para salvar periodicamente e proteger contra crashes.
 * NÃO remove as sessões — apenas persiste o acumulado até agora.
 */
export async function flushAllPresence() {
  const now = Date.now();

  for (const [userId, session] of presenceSessions.entries()) {
    const elapsed = (now - session.lastFlushedAt) / 1000;
    if (elapsed > 0) {
      await addPresenceTime(userId, session.username, elapsed);
      // Atualiza apenas a data do último flush
      session.lastFlushedAt = now;
    }
  }

  if (presenceSessions.size > 0) {
    console.log(`💾 [PRESENÇA] Flush periódico: ${presenceSessions.size} sessões salvas.`);
  }
}

/**
 * Finaliza TODAS as sessões ativas (usado no shutdown do bot).
 */
export async function stopAllPresenceTracking() {
  const userIds = [...presenceSessions.keys()];
  for (const userId of userIds) {
    await stopPresenceTracking(userId);
  }
  console.log(`🛑 [PRESENÇA] Todas as ${userIds.length} sessões finalizadas.`);
}

/**
 * Retorna o número de sessões ativas.
 * @returns {number}
 */
export function getActiveSessionCount() {
  return presenceSessions.size;
}

/**
 * Retorna o tempo de fala acumulado na sessão ativa de um usuário.
 * @param {string} userId - ID do usuário
 * @returns {number} Segundos falados na chamada atual
 */
export function getSessionSpeakingTime(userId) {
  const session = presenceSessions.get(userId);
  return session ? (session.speakingSeconds || 0) : 0;
}

/**
 * Verifica se um threshold de fala na sessão atual já foi testado.
 * Se não foi, marca como testado e retorna true.
 * @param {string} userId - ID do usuário
 * @param {string} thresholdKey - Chave identificadora do threshold (ex: 'onfire', 'orador')
 * @returns {boolean} true se acabou de marcar como testado (primeira vez), false se já estava marcado ou sem sessão
 */
export function checkAndMarkSessionThreshold(userId, thresholdKey) {
  const session = presenceSessions.get(userId);
  if (!session) return false;
  if (!session.thresholdsChecked) {
    session.thresholdsChecked = new Set();
  }
  if (session.thresholdsChecked.has(thresholdKey)) {
    return false;
  }
  session.thresholdsChecked.add(thresholdKey);
  return true;
}
