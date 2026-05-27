// ============================================
// voiceTracker.js — Rastreamento de tempo de presença em voz
// ============================================
// Gerencia o rastreamento de quando os usuários entram/saem
// de canais de voz, calculando o tempo total de presença.

import { addPresenceTime, saveVoiceSession } from './database.js';
import { addLog } from './utils/debugLogger.js';

let client = null;
export function setVoiceTrackerClient(cli) {
  client = cli;
}

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

  addLog('Presença', `${username} entrou no canal ${channelId} ${initialVideo ? '(câmera ativa)' : ''}`);
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

  addLog('Presença', `${session.username} saiu. Presença: ${Math.floor(totalSessionPresence)}s | Fala: ${Math.floor(session.speakingSeconds || 0)}s`);
  console.log(
    `📤 [PRESENÇA] ${session.username} saiu. ` +
    `Presença total: ${Math.floor(totalSessionPresence)}s | Fala total: ${Math.floor(session.speakingSeconds || 0)}s | Câmera total: ${Math.floor(session.cameraSeconds || 0)}s`
  );

  // Avalia conquistas de presença ao sair usando o client injetado
  if (client) {
    try {
      const channel = client.channels.cache.get(session.channelId) || await client.channels.fetch(session.channelId).catch(() => null);
      if (channel && channel.guild) {
        const { evaluatePresenceLootDrop } = await import('./utils/lootSystem.js');
        await evaluatePresenceLootDrop(
          client,
          channel.guild.id,
          channel.id,
          userId,
          session.username,
          totalSessionPresence,
          session.speakingSeconds || 0,
          session.cameraSeconds || 0,
          session.thresholdsChecked
        );
      } else {
        console.warn(`⚠️ [PRESENÇA] Canal ${session.channelId} não encontrado no stopPresenceTracking para ${session.username}`);
      }
    } catch (err) {
      console.error('❌ Erro ao processar drop de presença no stopPresenceTracking:', err.message);
    }
  } else {
    console.error('❌ [PRESENÇA] Client do Discord não definido no stopPresenceTracking');
  }

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

    // Calcula tempo de presença e de câmera acumulados na sessão ativa atual
    const currentPresenceSeconds = (now - session.originalJoinedAt) / 1000;
    const currentSpeakingSeconds = session.speakingSeconds || 0;
    
    let currentCameraSeconds = session.cameraSeconds || 0;
    if (session.cameraStartedAt) {
      currentCameraSeconds += (now - session.cameraStartedAt) / 1000;
    }

    // Avalia conquistas de presença em tempo real (durante a chamada) usando o client injetado
    if (client) {
      try {
        const channel = client.channels.cache.get(session.channelId) || await client.channels.fetch(session.channelId).catch(() => null);
        if (channel && channel.guild) {
          const { evaluatePresenceLootDrop } = await import('./utils/lootSystem.js');
          await evaluatePresenceLootDrop(
            client,
            channel.guild.id,
            channel.id,
            userId,
            session.username,
            currentPresenceSeconds,
            currentSpeakingSeconds,
            currentCameraSeconds,
            session.thresholdsChecked
          );
        }
      } catch (err) {
        console.error(`❌ Erro ao avaliar conquistas de presença periódica para ${session.username}:`, err.message);
      }
    }
  }

  if (presenceSessions.size > 0) {
    console.log(`💾 [PRESENÇA] Flush periódico e avaliação em tempo real: ${presenceSessions.size} sessões processadas.`);
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

/**
 * Retorna uma cópia das sessões de presença ativas para depuração.
 * @returns {Array}
 */
export function getAllActiveSessions() {
  const now = Date.now();
  return Array.from(presenceSessions.entries()).map(([userId, session]) => {
    // Soma o tempo já acumulado + o tempo atual da câmera (se estiver ativa agora)
    const liveCameraSeconds = session.cameraStartedAt ? (now - session.cameraStartedAt) / 1000 : 0;
    return {
      userId,
      username: session.username,
      channelId: session.channelId,
      presenceSeconds: (now - session.originalJoinedAt) / 1000,
      speakingSeconds: session.speakingSeconds || 0,
      cameraSeconds: (session.cameraSeconds || 0) + liveCameraSeconds,
      cameraActive: !!session.cameraStartedAt
    };
  });
}

/**
 * Retorna o Set de thresholds avaliados na sessão ativa do usuário.
 * @param {string} userId
 * @returns {Set<string>|null}
 */
export function getSessionThresholds(userId) {
  const session = presenceSessions.get(userId);
  return session ? session.thresholdsChecked : null;
}

