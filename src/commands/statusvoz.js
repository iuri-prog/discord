// ============================================
// commands/statusvoz.js — Comando /statusvoz
// ============================================
// Mostra as métricas de voz de um usuário específico
// ou do próprio autor do comando se nenhum usuário for mencionado.

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getUserMetrics } from '../database.js';
import { formatTime, speakingPercentage } from '../utils/formatTime.js';

export const data = new SlashCommandBuilder()
  .setName('statusvoz')
  .setDescription('Mostra as métricas de tempo em canais de voz de um usuário.')
  .addUserOption((option) =>
    option
      .setName('usuario')
      .setDescription('Usuário para consultar (padrão: você mesmo)')
      .setRequired(false)
  );

export async function execute(interaction) {
  await interaction.deferReply();

  // Determina o alvo: o mencionado ou o próprio autor
  const targetUser = interaction.options.getUser('usuario') || interaction.user;
  const metrics = await getUserMetrics(targetUser.id);

  if (!metrics) {
    const emptyEmbed = new EmbedBuilder()
      .setColor(0x5865F2) // Blurple do Discord
      .setTitle('📊 Status de Voz')
      .setDescription(
        `${targetUser} ainda não possui dados registrados.\n` +
        `O rastreamento começa quando o usuário entra em um canal de voz.`
      )
      .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
      .setTimestamp();

    return interaction.editReply({ embeds: [emptyEmbed] });
  }

  const presenceFormatted = formatTime(metrics.total_presence_time);
  const speakingFormatted = formatTime(metrics.total_speaking_time);
  const percentage = speakingPercentage(metrics.total_speaking_time, metrics.total_presence_time);

  // Barra de progresso visual
  const barLength = 20;
  const filledCount = Math.round(
    (metrics.total_speaking_time / Math.max(metrics.total_presence_time, 1)) * barLength
  );
  const filled = '█'.repeat(Math.min(filledCount, barLength));
  const empty = '░'.repeat(barLength - Math.min(filledCount, barLength));
  const progressBar = `\`${filled}${empty}\` ${percentage}`;

  const embed = new EmbedBuilder()
    .setColor(0x57F287) // Verde Discord
    .setTitle('📊 Métricas de Voz')
    .setDescription(`Estatísticas de **${targetUser.displayName || targetUser.username}**`)
    .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
    .addFields(
      {
        name: '🎧 Tempo de Presença',
        value: `\`${presenceFormatted}\``,
        inline: true,
      },
      {
        name: '🎙️ Tempo de Fala Real',
        value: `\`${speakingFormatted}\``,
        inline: true,
      },
      {
        name: '📈 Taxa de Fala / Presença',
        value: progressBar,
        inline: false,
      },
      {
        name: '🕐 Última Conexão',
        value: metrics.last_connected
          ? `<t:${Math.floor(new Date(metrics.last_connected).getTime() / 1000)}:R>`
          : 'Nunca',
        inline: true,
      }
    )
    .setFooter({
      text: `Solicitado por ${interaction.user.username}`,
      iconURL: interaction.user.displayAvatarURL({ size: 32 }),
    })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}
