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
export function startPresenceTracking(userId, username, channelId, initialVideo = false) {
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
    cameraStartedAt: initialVideo ? now : null, // Timestamp de quando ligou a câmera
    cameraSeconds: 0, // Segundos com a câmera ligada na sessão atual
  });

  console.log(`📥 [PRESENÇA] ${username} entrou no canal de voz (${channelId}) ${initialVideo ? 'com câmera ligada' : ''}`);
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
  
  // Computa tempo restante de câmera ligada se ainda estiver ativa ao desconectar
  if (session.cameraStartedAt) {
    const elapsedCam = (now - session.cameraStartedAt) / 1000;
    session.cameraSeconds = (session.cameraSeconds || 0) + elapsedCam;
    session.cameraStartedAt = null;
  }

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
    `Presença total: ${Math.floor(totalSessionPresence)}s | Fala total: ${Math.floor(session.speakingSeconds || 0)}s | Câmera total: ${Math.floor(session.cameraSeconds || 0)}s`
  );

  // Importa dinamicamente o client do Discord e o motor de loot para avaliar conquistas de presença ao sair
  import('./index.js').then(({ client }) => {
    const channel = client.channels.cache.get(session.channelId);
    if (channel && channel.guild) {
      import('./utils/lootSystem.js').then(({ evaluatePresenceLootDrop }) => {
        evaluatePresenceLootDrop(
          client,
          channel.guild.id,
          channel.id,
          userId,
          session.username,
          totalSessionPresence,
          session.speakingSeconds || 0,
          session.cameraSeconds || 0
        ).catch(err => {
          console.error('❌ Erro no evaluatePresenceLootDrop:', err.message);
        });
      }).catch(err => {
        console.error('❌ Erro ao importar lootSystem no stopPresenceTracking:', err.message);
      });
    }
  }).catch(err => {
    console.error('❌ Erro ao importar client no stopPresenceTracking:', err.message);
  });

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

/**
 * Atualiza o estado da câmera (ligada/desligada) do usuário.
 * @param {string} userId - ID do usuário
 * @param {boolean} isCamOn - Estado da câmera
 */
export function updateCameraState(userId, isCamOn) {
  const session = presenceSessions.get(userId);
  if (!session) return;

  const now = Date.now();
  if (isCamOn) {
    if (!session.cameraStartedAt) {
      session.cameraStartedAt = now;
      console.log(`📷 [CÂMERA] ${session.username} ligou a câmera.`);
    }
  } else {
    if (session.cameraStartedAt) {
      const elapsed = (now - session.cameraStartedAt) / 1000;
      session.cameraSeconds = (session.cameraSeconds || 0) + elapsed;
      session.cameraStartedAt = null;
      console.log(`📷 [CÂMERA] ${session.username} desligou a câmera. Tempo na sessão: ${Math.floor(session.cameraSeconds)}s`);
    }
  }
}
