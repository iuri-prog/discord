// ============================================
// formatTime.js — Utilitário de formatação de tempo
// ============================================

/**
 * Converte segundos em formato legível (ex: "2h 15m 30s").
 * @param {number} totalSeconds - Total de segundos a converter
 * @returns {string} Tempo formatado
 */
export function formatTime(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return '0s';

  const seconds = Math.floor(totalSeconds);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

/**
 * Retorna a porcentagem de tempo de fala em relação ao tempo de presença.
 * @param {number} speakingTime - Tempo de fala em segundos
 * @param {number} presenceTime - Tempo de presença em segundos
 * @returns {string} Porcentagem formatada (ex: "42.5%")
 */
export function speakingPercentage(speakingTime, presenceTime) {
  if (!presenceTime || presenceTime <= 0) return '0%';
  const percentage = (speakingTime / presenceTime) * 100;
  return `${Math.min(percentage, 100).toFixed(1)}%`;
}
