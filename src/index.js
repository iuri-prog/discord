// ============================================
// index.js — Ponto de entrada principal do bot
// ============================================
// Bot Discord para métricas avançadas de canais de voz.
// Rastreia tempo de presença e tempo de fala real dos usuários.

import {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  ActivityType,
} from 'discord.js';
import http from 'http';
import { config } from './config.js';

import { initDatabase } from './database.js';
import {
  startPresenceTracking,
  stopPresenceTracking,
  isTracking,
  flushAllPresence,
  stopAllPresenceTracking,
} from './voiceTracker.js';
import {
  flushAllSpeaking,
  stopAllSpeaking,
} from './speakingTracker.js';
import {
  syncVoiceChannels,
  joinChannel,
  leaveChannel,
  disconnectAll,
} from './voiceManager.js';

// Importa os comandos e script de deploy
import * as statusvozCommand from './commands/statusvoz.js';
import * as topfalaCommand from './commands/topfala.js';
import * as levelCommand from './commands/level.js';
import * as toplevelCommand from './commands/toplevel.js';
import { deployCommands } from './commands/deploy.js';


// ============================================
// 1. Cria o client do Discord com as intents necessárias
// ============================================
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,           // Acesso a servidores
    GatewayIntentBits.GuildVoiceStates,  // Eventos de voz (join/leave/mute/deaf)
    GatewayIntentBits.GuildMembers,      // Acesso a membros (para nomes)
  ],
});

// ============================================
// 2. Registra os comandos em uma Collection
// ============================================
client.commands = new Collection();
client.commands.set(statusvozCommand.data.name, statusvozCommand);
client.commands.set(topfalaCommand.data.name, topfalaCommand);
client.commands.set(levelCommand.data.name, levelCommand);
client.commands.set(toplevelCommand.data.name, toplevelCommand);

// ============================================
// 3. Evento: Bot está pronto
// ============================================
client.once(Events.ClientReady, async (readyClient) => {
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log(`🤖 Bot conectado como: ${readyClient.user.tag}`);
  console.log(`📊 Servidores: ${readyClient.guilds.cache.size}`);
  console.log('═══════════════════════════════════════════');
  console.log('');

  // Define o status/atividade do bot
  readyClient.user.setActivity('canais de voz 🎙️', {
    type: ActivityType.Watching,
  });

  // ===================================================
  // Sincronização inicial: verifica quem já está em voz
  // ===================================================
  for (const [, guild] of readyClient.guilds.cache) {
    // Busca todos os membros (necessário para o cache)
    try {
      await guild.members.fetch();
    } catch {
      console.warn(`⚠️  Não foi possível buscar membros de ${guild.name}`);
    }

    // Para cada canal de voz, verifica se há usuários
    const voiceChannels = guild.channels.cache.filter(
      (ch) => ch.type === 2 /* GuildVoice */ || ch.type === 13 /* GuildStageVoice */
    );

    for (const [, channel] of voiceChannels) {
      const humanMembers = channel.members.filter((m) => !m.user.bot);

      // Se há humanos no canal, inicia o rastreamento de presença
      for (const [memberId, member] of humanMembers) {
        if (!isTracking(memberId)) {
          startPresenceTracking(
            memberId,
            member.displayName || member.user.username,
            channel.id
          );
        }
      }
    }

    // Conecta o bot nos canais com usuários (para fala)
    await syncVoiceChannels(guild, readyClient);
  }

  // ===================================================
  // Flush periódico: salva dados a cada N minutos
  // ===================================================
  setInterval(async () => {
    try {
      await flushAllPresence();
      await flushAllSpeaking();
    } catch (err) {
      console.error('❌ Erro no flush periódico:', err.message);
    }
  }, config.SAVE_INTERVAL_MS);

  console.log('✅ Sincronização inicial concluída. Bot operacional.');
});

// ============================================
// 4. Evento: Mudança de estado de voz (join/leave/switch/mute)
// ============================================
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const userId = newState.id;
  const member = newState.member;

  // Ignora bots
  if (member?.user?.bot) return;

  const username = member?.displayName || member?.user?.username || userId;
  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;

  // ─── Caso 1: Usuário ENTROU em um canal de voz ─────────────
  if (!oldChannelId && newChannelId) {
    startPresenceTracking(userId, username, newChannelId);

    // Sincroniza para garantir que o bot está no canal mais cheio
    await syncVoiceChannels(newState.guild, client);
  }

  // ─── Caso 2: Usuário SAIU de um canal de voz ─────────────
  else if (oldChannelId && !newChannelId) {
    await stopPresenceTracking(userId);

    // Sincroniza para atualizar a conexão do bot para o canal mais cheio (ou desconectar se tudo estiver vazio)
    await syncVoiceChannels(oldState.guild, client);
  }

  // ─── Caso 3: Usuário TROCOU de canal ─────────────
  else if (oldChannelId && newChannelId && oldChannelId !== newChannelId) {
    // Finaliza a sessão do canal antigo e inicia no novo
    await stopPresenceTracking(userId);
    startPresenceTracking(userId, username, newChannelId);

    // Sincroniza para atualizar a conexão do bot para o canal mais cheio
    await syncVoiceChannels(newState.guild, client);
  }


  // ─── Caso 4: Mesmo canal, mudança de estado (mute/deaf/etc) ─────
  // Não afeta presença — o usuário continua no canal.
  // Mute/deaf NÃO interrompe a presença, apenas a fala é gerenciada
  // pelo speaking event listener no voiceManager.
});

// ============================================
// 5. Evento: Interação de comando (Slash Commands)
// ============================================
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    console.warn(`⚠️  Comando desconhecido: ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`❌ Erro ao executar /${interaction.commandName}:`, error);

    const reply = {
      content: '❌ Ocorreu um erro ao executar este comando. Tente novamente.',
      ephemeral: true,
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

// ============================================
// 6. Graceful Shutdown — Salva tudo antes de encerrar
// ============================================
async function gracefulShutdown(signal) {
  console.log(`\n🛑 Recebido ${signal}. Salvando dados e encerrando...`);

  try {
    // Salva todas as sessões de presença ativas
    await stopAllPresenceTracking();

    // Salva todas as sessões de fala ativas
    await stopAllSpeaking();

    // Desconecta de todos os canais de voz
    await disconnectAll();

    console.log('✅ Dados salvos com sucesso. Encerrando bot.');
  } catch (err) {
    console.error('❌ Erro durante shutdown:', err.message);
  }

  // Destrói o client do Discord
  client.destroy();
  process.exit(0);
}

// Captura sinais de encerramento
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Captura erros não tratados para evitar crash sem salvar
process.on('uncaughtException', async (err) => {
  console.error('❌ Exceção não capturada:', err);
  await gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Promise rejeitada sem handler:', reason);
  // Não encerra — apenas loga. Encerrar aqui poderia causar data loss.
});

// ============================================
// 7. Inicializa o bot
// ============================================
(async () => {
  console.log('🚀 Iniciando bot de métricas de voz...');
  console.log('');

  // Inicializa o banco de dados
  await initDatabase();

  // Registra / atualiza os comandos slash no Discord
  await deployCommands();

  // Cria um servidor HTTP simples para passar no Health Check do Railway/Render
  const PORT = process.env.PORT || 3000;
  http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is online!');
  }).listen(PORT, () => {
    console.log(`📡 Servidor de Health Check ativo na porta ${PORT}`);
  });

  // Conecta ao Discord
  await client.login(config.token);
})();


