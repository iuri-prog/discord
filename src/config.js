// ============================================
// config.js — Configuração centralizada do bot
// ============================================
// Carrega variáveis de ambiente do arquivo .env
import 'dotenv/config';

/**
 * Validação de variáveis obrigatórias.
 * O bot não inicia se alguma estiver ausente.
 */
const REQUIRED_VARS = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'DISCORD_GUILD_ID',
  'SUPABASE_URL',
  'SUPABASE_KEY',
];

for (const varName of REQUIRED_VARS) {
  if (!process.env[varName]) {
    console.error(`❌ Variável de ambiente "${varName}" não está definida. Verifique seu arquivo .env`);
    process.exit(1);
  }
}

export const config = {
  // Discord
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.DISCORD_GUILD_ID,

  // Supabase
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_KEY,

  // Intervalo (ms) para salvar métricas parciais no banco (failsafe contra crashes)
  // A cada 5 minutos, os dados em memória são persistidos
  SAVE_INTERVAL_MS: 5 * 60 * 1000,
};
