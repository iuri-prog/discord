// ============================================
// commands/deploy.js — Deploy dos Slash Commands
// ============================================
// Execute este script UMA VEZ para registrar os
// comandos de barra no Discord:
//   node src/commands/deploy.js

import { REST, Routes } from 'discord.js';
import { config } from '../config.js';
import { data as statusvoz } from './statusvoz.js';
import { data as topfala } from './topfala.js';

const commands = [statusvoz.toJSON(), topfala.toJSON()];

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
  try {
    console.log(`📡 Registrando ${commands.length} comando(s) de barra...`);

    // Registra os comandos no servidor (guild) específico
    // Para registro global (todos os servidores), use:
    //   Routes.applicationCommands(config.clientId)
    const data = await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands }
    );

    console.log(`✅ ${data.length} comando(s) registrado(s) com sucesso!`);
    console.log('   Comandos disponíveis:');
    data.forEach((cmd) => console.log(`   - /${cmd.name}: ${cmd.description}`));
  } catch (error) {
    console.error('❌ Erro ao registrar comandos:', error);
  }
})();
