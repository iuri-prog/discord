// ============================================
// voiceTracker.js — Rastreamento de tempo de presença em voz
// ============================================
// Gerencia o rastreamento de quando os usuários entram/saem
// de canais de voz, calculando o tempo total de presença.

import { addPresenceTime } from './database.js';

/**
 * Map em memória para rastrear timestamps de entrada.
 * Chave: userId | Valor: { joinedAt: Date, username: string, channelId: string }
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

  presenceSessions.set(userId, {
    joinedAt: Date.now(),
    username,
    channelId,
  });

  console.log(`📥 [PRESENÇA] ${username} entrou no canal de voz (${channelId})`);
}

/**
 * Finaliza o rastreamento de presença e salva no banco de dados.
 * @param {string} userId - ID do usuário
 * @returns {number} Tempo de presença em segundos (0 se não havia sessão)
 */
export async function stopPresenceTracking(userId) {
  const session = presenceSessions.get(userId);
  if (!session) return 0;

  const elapsed = (Date.now() - session.joinedAt) / 1000; // converter ms → s
  presenceSessions.delete(userId);

  // Salva no banco de dados
  await addPresenceTime(userId, session.username, elapsed);

  console.log(
    `📤 [PRESENÇA] ${session.username} saiu do canal de voz. ` +
    `Tempo: ${Math.floor(elapsed)}s`
  );

  return elapsed;
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
 * Salva todos os dados parciais de presença no banco (failsafe).
 * Útil para salvar periodicamente e proteger contra crashes.
 * NÃO remove as sessões — apenas persiste o acumulado até agora.
 */
export async function flushAllPresence() {
  const now = Date.now();

  for (const [userId, session] of presenceSessions.entries()) {
    const elapsed = (now - session.joinedAt) / 1000;
    if (elapsed > 0) {
      await addPresenceTime(userId, session.username, elapsed);
      // Reseta o timestamp para evitar contagem dupla
      session.joinedAt = now;
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
