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

  // Razão de fala (Tempo de fala / Tempo de presença)
  const ratio = totalPresence > 0 ? (totalSpeaking / totalPresence) : 0;

  // Patentes / Ranks dinâmicos baseados no estilo de conversa (Ratio) + Nível
  let rank = "";

  if (ratio < 0.10) {
    // 🎧 Caminho 1: O Ouvinte (Prefere escutar, silencioso ativo)
    if (level >= 100) rank = "🌌 Consciência Cósmica";
    else if (level >= 75) rank = "👑 Imperador do Vácuo";
    else if (level >= 50) rank = "🔮 Mente Telepática";
    else if (level >= 35) rank = "🧠 Sábio Ouvinte";
    else if (level >= 20) rank = "🛡️ Guardião do Silêncio";
    else if (level >= 10) rank = "👤 Espectador de Elite";
    else if (level >= 5) rank = "👂 Ouvinte Atento";
    else rank = "🤫 Monge Silencioso";
  } 
  else if (ratio < 0.30) {
    // 🗣️ Caminho 2: O Conversador (Moderado, equilíbrio perfeito)
    if (level >= 100) rank = "🌌 Lenda do Som";
    else if (level >= 75) rank = "👑 Mestre da Voz";
    else if (level >= 50) rank = "🎓 Diplomata do Chat";
    else if (level >= 35) rank = "📣 Porta-Voz do Servidor";
    else if (level >= 20) rank = "📢 Debatedor Ativo";
    else if (level >= 10) rank = "🎙️ Podcaster";
    else if (level >= 5) rank = "🗣️ Conversador";
    else rank = "💬 Sussurrador";
  } 
  else {
    // 🎤 Caminho 3: O Palestrante / Tagarela (Voz ativa do servidor, fala muito)
    if (level >= 100) rank = "🌌 Deus do Som";
    else if (level >= 75) rank = "👑 Soberano do Áudio";
    else if (level >= 50) rank = "🗣️ Filósofo do Mic";
    else if (level >= 35) rank = "🔥 Incendiário do Microfone";
    else if (level >= 20) rank = "⚡ Orador Elétrico";
    else if (level >= 10) rank = "🎙️ Locutor";
    else if (level >= 5) rank = "📢 Tagarela";
    else rank = "🎤 Cantor de Chuveiro";
  }

  return {
    xp,
    level,
    xpInCurrentLevel,
    xpNeededForNextLevel,
    progressPercent,
    rank,
    ratio,
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
