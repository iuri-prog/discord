// ============================================
// voiceManager.js — Gerenciamento de conexões de voz do bot
// ============================================
// Controla a entrada/saída automática do bot em canais de voz
// para captar os eventos de fala (speaking) dos usuários.

import {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
} from '@discordjs/voice';
import { startSpeaking, stopSpeaking, stopAllSpeaking } from './speakingTracker.js';
import { ChannelType } from 'discord.js';

/**
 * Map de canais onde o bot está conectado.
 * Chave: channelId | Valor: { connection, guildId }
 */
const activeConnections = new Map();

/**
 * Conecta o bot a um canal de voz para escutar eventos de fala.
 * @param {VoiceChannel|StageChannel} channel - Canal de voz para conectar
 * @param {Client} client - Instância do client Discord
 */
export async function joinChannel(channel, client) {
  // Evita reconexão se já está no canal
  if (activeConnections.has(channel.id)) return;

  try {
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,  // Bot NÃO fica surdo — precisa ouvir para detectar fala
      selfMute: true,   // Bot fica mutado — não emite som
    });

    // Aguarda a conexão estar pronta (timeout de 30s)
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

    activeConnections.set(channel.id, {
      connection,
      guildId: channel.guild.id,
    });

    console.log(`🔊 [VOZ] Bot conectado ao canal: ${channel.name} (${channel.id})`);

    // ===================================================
    // Configura o listener de fala (Speaking Events)
    // ===================================================
    const receiver = connection.receiver;

    /**
     * Evento disparado quando um usuário COMEÇA a falar.
     * O receiver.speaking emite 'start' com o userId.
     */
    receiver.speaking.on('start', (userId) => {
      // Busca o membro para obter o nome de exibição
      const guild = client.guilds.cache.get(channel.guild.id);
      const member = guild?.members.cache.get(userId);
      const username = member?.displayName || member?.user?.username || userId;

      startSpeaking(channel.guild.id, userId, username);
    });

    /**
     * Evento disparado quando um usuário PARA de falar.
     * O receiver.speaking emite 'end' com o userId.
     */
    receiver.speaking.on('end', async (userId) => {
      await stopSpeaking(channel.guild.id, userId);
    });

    // ===================================================
    // Tratamento de desconexão inesperada
    // ===================================================
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // Tenta reconectar (pode ser uma troca de região)
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
        // Reconectando... não faz nada
      } catch {
        // Não conseguiu reconectar — limpa a sessão
        console.log(`⚠️  [VOZ] Desconectado do canal: ${channel.name}`);
        await cleanupConnection(channel.id, channel.guild.id);
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      activeConnections.delete(channel.id);
    });

  } catch (error) {
    console.error(`❌ [VOZ] Erro ao conectar no canal ${channel.name}:`, error.message);
    activeConnections.delete(channel.id);
  }
}

/**
 * Desconecta o bot de um canal de voz.
 * Finaliza todas as sessões de fala associadas.
 * @param {string} channelId - ID do canal
 * @param {string} guildId - ID do servidor
 */
export async function leaveChannel(channelId, guildId) {
  await cleanupConnection(channelId, guildId);
}

/**
 * Limpa a conexão e salva dados pendentes.
 * @param {string} channelId - ID do canal
 * @param {string} guildId - ID do servidor
 */
async function cleanupConnection(channelId, guildId) {
  const entry = activeConnections.get(channelId);
  if (!entry) return;

  // Finaliza sessões de fala dos usuários no canal
  await stopAllSpeaking(guildId);

  // Destrói a conexão de voz
  try {
    entry.connection.destroy();
  } catch {
    // Já destruída
  }

  activeConnections.delete(channelId);
  console.log(`🔇 [VOZ] Bot desconectado do canal (${channelId})`);
}

/**
 * Verifica todos os canais de voz do servidor e gerencia conexões:
 * - Entra em canais que possuem usuários (humanos)
 * - Sai de canais que estão vazios
 * @param {Guild} guild - Instância do servidor
 * @param {Client} client - Instância do client Discord
 */
export async function syncVoiceChannels(guild, client) {
  const voiceChannels = guild.channels.cache.filter(
    (ch) => ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice
  );

  for (const [channelId, channel] of voiceChannels) {
    // Conta apenas membros humanos (exclui bots)
    const humanMembers = channel.members.filter((m) => !m.user.bot).size;

    if (humanMembers > 0 && !activeConnections.has(channelId)) {
      // Há usuários no canal, mas o bot não está lá — conecta
      await joinChannel(channel, client);
    } else if (humanMembers === 0 && activeConnections.has(channelId)) {
      // Canal vazio e bot está lá — desconecta
      await leaveChannel(channelId, guild.id);
    }
  }
}

/**
 * Desconecta de TODOS os canais (usado no shutdown).
 */
export async function disconnectAll() {
  const entries = [...activeConnections.entries()];
  for (const [channelId, { guildId }] of entries) {
    await cleanupConnection(channelId, guildId);
  }
  console.log(`🛑 [VOZ] Todas as ${entries.length} conexões encerradas.`);
}

/**
 * Verifica se o bot está conectado a um canal específico.
 * @param {string} channelId - ID do canal
 * @returns {boolean}
 */
export function isConnectedTo(channelId) {
  return activeConnections.has(channelId);
}
