// ============================================
// commands/logs.js — Comando /logs
// ============================================
// Painel de depuração em tempo real de logs e sessões de voz ativas.

import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getAllActiveSessions } from '../voiceTracker.js';
import { getLogs } from '../utils/debugLogger.js';
import { getLastAwardedBadge } from '../database.js';

export const data = new SlashCommandBuilder()
  .setName('logs')
  .setDescription('Painel de logs em tempo real para verificar detecção de voz e drops.');

function formatDuration(totalSeconds) {
  if (totalSeconds < 60) return `${Math.floor(totalSeconds)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${hours}h ${remMinutes}m`;
}

export function getLogsPayload(authorId, lastBadge) {
  const activeSessions = getAllActiveSessions();
  const recentLogs = getLogs();

  let lastBadgeText = 'Nenhuma conquista registrada no banco de dados ainda.';
  if (lastBadge) {
    const timeFormatted = lastBadge.earned_at ? `<t:${Math.floor(new Date(lastBadge.earned_at).getTime() / 1000)}:R>` : 'Desconhecido';
    lastBadgeText = `🏆 **${lastBadge.badge_icon} ${lastBadge.badge_name}** obtida por **${lastBadge.username}** · ${timeFormatted}`;
  }

  let sessionsText = 'Nenhum membro sendo rastreado em canal de voz no momento.';
  if (activeSessions.length > 0) {
    sessionsText = activeSessions.map(s => {
      const duration = formatDuration(s.presenceSeconds);
      const speaking = formatDuration(s.speakingSeconds);
      const cam = s.cameraActive ? `📷 ativa (${formatDuration(s.cameraSeconds)})` : '📷 inativa';
      return `• **${s.username}**: em call há \`${duration}\` | falou \`${speaking}\` | ${cam}`;
    }).join('\n');
  }

  let logsText = 'Nenhum evento registrado no buffer ainda.';
  if (recentLogs.length > 0) {
    logsText = recentLogs.slice(-15).map(line => `\`${line}\``).join('\n');
  }

  const containerComponents = [
    {
      type: 10, // Text Display
      content: `# 🪵 Painel de Monitoramento & Logs\nUse este painel para verificar se o bot está rastreando a fala e a presença de forma correta.`
    },
    {
      type: 14, // Separator
      divider: true,
      spacing: 1
    },
    {
      type: 10, // Text Display
      content: `### 👥 Rastreamento de Voz Ativo (${activeSessions.length})\n${sessionsText}`
    },
    {
      type: 14, // Separator
      divider: true,
      spacing: 1
    },
    {
      type: 10, // Text Display
      content: `### 📜 Últimos 15 Eventos em Memória (RNG & Voz)\n${logsText}`
    },
    {
      type: 14, // Separator
      divider: true,
      spacing: 1
    },
    {
      type: 10, // Text Display
      content: `### 🎁 Última Conquista Entregue\n${lastBadgeText}`
    }
  ];

  const refreshBtn = new ButtonBuilder()
    .setCustomId(`logs:refresh:${authorId}`)
    .setLabel('Atualizar Logs')
    .setEmoji('🔄')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(refreshBtn);

  return {
    flags: 32768, // IS_COMPONENTS_V2
    components: [
      {
        type: 17, // CONTAINER
        accent_color: 5814783, // 0x5865F2 Blurple
        components: containerComponents
      },
      row.toJSON()
    ]
  };
}

export async function execute(interaction) {
  await interaction.deferReply();
  try {
    const lastBadge = await getLastAwardedBadge();
    const payload = getLogsPayload(interaction.user.id, lastBadge);
    await interaction.editReply(payload);
  } catch (error) {
    console.error('Erro ao exibir logs:', error);
    await interaction.editReply({
      content: '❌ Ocorreu um erro ao carregar os logs.'
    });
  }
}

export async function handleInteraction(interaction, args) {
  const [action, authorId] = args;

  if (interaction.user.id !== authorId) {
    return interaction.reply({
      content: '❌ Apenas quem executou o comando pode atualizar o painel.',
      ephemeral: true
    });
  }

  if (action === 'refresh') {
    await interaction.deferUpdate();
    try {
      const lastBadge = await getLastAwardedBadge();
      const payload = getLogsPayload(authorId, lastBadge);
      await interaction.editReply(payload);
    } catch (error) {
      console.error('Erro ao atualizar logs:', error);
    }
  }
}
