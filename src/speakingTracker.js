// ============================================
// speakingTracker.js — Rastreamento de tempo de fala real
// ============================================
// Gerencia o rastreamento de quando os usuários estão
// efetivamente falando (emitindo som) em canais de voz.

import { addSpeakingTime } from './database.js';
import { incrementSessionSpeakingTime } from './voiceTracker.js';

/**
 * Map em memória para rastrear timestamps de início de fala.
 * Chave: `${guildId}:${userId}` | Valor: { startedAt: Date, username: string }
 *
 * Usamos a chave composta para suportar múltiplos servidores.
 */
const speakingSessions = new Map();

/**
 * Gera a chave composta para o Map.
 * @param {string} guildId - ID do servidor
 * @param {string} userId - ID do usuário
 * @returns {string} Chave composta
 */
function makeKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

/**
 * Registra que o usuário começou a falar.
 * Se já existe uma sessão de fala ativa, ignora (evita duplicatas).
 * @param {string} guildId - ID do servidor
 * @param {string} userId - ID do usuário
 * @param {string} username - Nome de exibição
 */
export function startSpeaking(guildId, userId, username) {
  const key = makeKey(guildId, userId);

  // Ignora se já está falando (evita reiniciar o timer)
  if (speakingSessions.has(key)) return;

  speakingSessions.set(key, {
    startedAt: Date.now(),
    username,
    userId,
  });
}

/**
 * Registra que o usuário parou de falar e salva no banco.
 * @param {string} guildId - ID do servidor
 * @param {string} userId - ID do usuário
 * @returns {number} Tempo de fala em segundos (0 se não havia sessão)
 */
export async function stopSpeaking(guildId, userId) {
  const key = makeKey(guildId, userId);
  const session = speakingSessions.get(key);

  if (!session) return 0;

  const elapsed = (Date.now() - session.startedAt) / 1000; // ms → s
  speakingSessions.delete(key);

  // Salva no banco — descarta sessões menores que 0.3s (anti-ruído)
  if (elapsed >= 0.3) {
    await addSpeakingTime(userId, session.username, elapsed);
    // Acumula também na sessão de voz ativa (para o histórico)
    incrementSessionSpeakingTime(userId, elapsed);
  }

  return elapsed;
}

/**
 * Verifica se um usuário está falando no momento.
 * @param {string} guildId - ID do servidor
 * @param {string} userId - ID do usuário
 * @returns {boolean}
 */
export function isSpeaking(guildId, userId) {
  return speakingSessions.has(makeKey(guildId, userId));
}

/**
 * Salva todos os dados parciais de fala no banco (failsafe).
 * Reseta os timestamps para evitar contagem dupla.
 */
export async function flushAllSpeaking() {
  const now = Date.now();

  for (const [key, session] of speakingSessions.entries()) {
    const elapsed = (now - session.startedAt) / 1000;
    if (elapsed >= 0.3) {
      await addSpeakingTime(session.userId, session.username, elapsed);
      // Acumula também na sessão de voz ativa (para o histórico)
      incrementSessionSpeakingTime(session.userId, elapsed);
      // Reseta o timestamp
      session.startedAt = now;
    }
  }

  if (speakingSessions.size > 0) {
    console.log(`💾 [FALA] Flush periódico: ${speakingSessions.size} sessões salvas.`);
  }
}

/**
 * Finaliza TODAS as sessões de fala ativas (usado no shutdown).
 * @param {string} [guildId] - Se informado, finaliza apenas sessões desse servidor
 */
export async function stopAllSpeaking(guildId) {
  const keys = [...speakingSessions.keys()];

  for (const key of keys) {
    // Se guildId foi informado, filtra apenas as desse servidor
    if (guildId && !key.startsWith(`${guildId}:`)) continue;

    const session = speakingSessions.get(key);
    if (!session) continue;

    const elapsed = (Date.now() - session.startedAt) / 1000;
    speakingSessions.delete(key);

    if (elapsed >= 0.3) {
      await addSpeakingTime(session.userId, session.username, elapsed);
      // Acumula também na sessão de voz ativa (para o histórico)
      incrementSessionSpeakingTime(session.userId, elapsed);
    }
  }
}
