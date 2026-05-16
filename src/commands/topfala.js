// ============================================
// commands/topfala.js — Comando /topfala
// ============================================
// Exibe um leaderboard com o Top 10 usuários com
// mais tempo de fala real no servidor.

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getTopSpeakers } from '../database.js';
import { formatTime, speakingPercentage } from '../utils/formatTime.js';

// Emojis para as posições do podium
const MEDALS = ['🥇', '🥈', '🥉'];

export const data = new SlashCommandBuilder()
  .setName('topfala')
  .setDescription('Mostra o Top 10 usuários com mais tempo de fala real no servidor.');

export async function execute(interaction) {
  await interaction.deferReply();

  const topUsers = await getTopSpeakers(10);

  if (topUsers.length === 0) {
    const emptyEmbed = new EmbedBuilder()
      .setColor(0xFEE75C) // Amarelo Discord
      .setTitle('🏆 Ranking de Fala — Top 10')
      .setDescription(
        'Nenhum dado de fala registrado ainda.\n' +
        'Os dados começam a ser coletados quando usuários falam em canais de voz.'
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [emptyEmbed] });
  }

  // Constrói a lista do leaderboard
  const leaderboard = topUsers.map((user, index) => {
    const position = index < 3 ? MEDALS[index] : `**${index + 1}.**`;
    const speakTime = formatTime(user.total_speaking_time);
    const presenceTime = formatTime(user.total_presence_time);
    const percentage = speakingPercentage(user.total_speaking_time, user.total_presence_time);

    return (
      `${position} **${user.username}**\n` +
      `   🎙️ Fala: \`${speakTime}\` · 🎧 Presença: \`${presenceTime}\` · 📈 \`${percentage}\``
    );
  });

  const embed = new EmbedBuilder()
    .setColor(0xEB459E) // Rosa/Fuchsia Discord
    .setTitle('🏆 Ranking de Fala — Top 10')
    .setDescription(leaderboard.join('\n\n'))
    .setFooter({
      text: `Solicitado por ${interaction.user.username} · ${topUsers.length} usuários no ranking`,
      iconURL: interaction.user.displayAvatarURL({ size: 32 }),
    })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}
