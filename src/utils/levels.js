// ============================================
// utils/levels.js — Sistema de Níveis e XP
// ============================================
// Gerencia a conversão de tempo de voz (presença e fala)
// em pontos de XP e níveis de RPG com títulos criativos.

/**
 * Calcula os dados de nível baseados no tempo de presença e tempo de fala.
 * @param {number} presenceTime - Tempo total de presença em segundos
 * @param {number} speakingTime - Tempo total de fala em segundos
 */
export function getLevelData(presenceTime, speakingTime) {
  const totalPresence = Math.floor(presenceTime || 0);
  const totalSpeaking = Math.floor(speakingTime || 0);
  
  // XP: 3 XP por segundo falado, 1 XP por segundo de presença (1/3 de fala)
  const xp = (totalSpeaking * 3) + (totalPresence * 1);
  
  // Fórmula do Nível: Nível = Math.floor(Math.sqrt(xp / 100)) + 1
  // Progressão Quadrática:
  // Nível 1: 0 - 99 XP
  // Nível 2: 100 - 399 XP
  // Nível 3: 400 - 899 XP
  // Nível 10: 8100 XP
  const level = Math.floor(Math.sqrt(xp / 100)) + 1;
  
  // XP inicial do nível atual
  const currentLevelXp = Math.pow(level - 1, 2) * 100;
  // XP necessário para o próximo nível
  const nextLevelXp = Math.pow(level, 2) * 100;
  
  // XP acumulado dentro do nível atual e total necessário para subir
  const xpInCurrentLevel = xp - currentLevelXp;
  const xpNeededForNextLevel = nextLevelXp - currentLevelXp;
  
  // Porcentagem de progresso
  const progressPercent = xpNeededForNextLevel > 0
    ? Math.min(100, Math.floor((xpInCurrentLevel / xpNeededForNextLevel) * 100))
    : 100;

  // Patentes / Ranks criativos baseados no som
  let rank = "🤫 Silencioso";
  if (level >= 100) rank = "🌌 Lenda do Som";
  else if (level >= 75) rank = "👑 Mestre da Voz";
  else if (level >= 50) rank = "📢 Orador Magnífico";
  else if (level >= 35) rank = "🎙️ Locutor de Elite";
  else if (level >= 20) rank = "🔊 Tagarela Ativo";
  else if (level >= 10) rank = "🗣️ Conversador";
  else if (level >= 5) rank = "👂 Ouvinte Ativo";

  return {
    xp,
    level,
    xpInCurrentLevel,
    xpNeededForNextLevel,
    progressPercent,
    rank,
  };
}

/**
 * Cria uma barra de progresso visual em formato de texto para o Discord.
 * Exemplo: [██████░░░░░░] 50%
 * @param {number} percent - Percentual de progresso (0-100)
 * @param {number} length - Tamanho da barra (caracteres)
 * @returns {string} Barra de progresso formatada
 */
export function renderProgressBar(percent, length = 12) {
  const filledCount = Math.round((percent / 100) * length);
  const emptyCount = length - filledCount;
  
  // Garante valores positivos e corretos
  const cleanFilled = Math.max(0, Math.min(length, filledCount));
  const cleanEmpty = Math.max(0, Math.min(length, emptyCount));
  
  const filled = "█".repeat(cleanFilled);
  const empty = "░".repeat(cleanEmpty);
  
  return `\`[${filled}${empty}]\` **${percent}%**`;
}
