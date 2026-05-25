// ============================================
// debugLogger.js — Buffer de logs em memória para depuração
// ============================================

const MAX_LOGS = 30;
const logs = [];

/**
 * Adiciona um log no buffer em memória.
 * @param {string} moduleName 
 * @param {string} message 
 */
export function addLog(moduleName, message) {
  const now = new Date();
  const timestamp = now.toLocaleTimeString('pt-BR', { hour12: false });
  const logLine = `[${timestamp}] [${moduleName}] ${message}`;
  
  logs.push(logLine);
  if (logs.length > MAX_LOGS) {
    logs.shift();
  }
}

/**
 * Retorna todos os logs formatados.
 * @returns {Array<string>}
 */
export function getLogs() {
  return logs;
}
