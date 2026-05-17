// ============================================
// commands/toplevel.js — Comando /toplevel
// ============================================
// Exibe um leaderboard com o Top 10 usuários com
// maior nível e XP acumulados no servidor.

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getTopLevels } from '../database.js';
import { getLevelData } from '../utils/levels.js';

// Emojis para as posições do podium
const MEDALS = ['🥇', '🥈', '🥉'];

export const data = new SlashCommandBuilder()
  .setName('toplevel')
  .setDescription('Mostra o Top 10 usuários com maior nível e XP de voz no servidor.');

export async function execute(interaction) {
  await interaction.deferReply();

  const topUsers = await getTopLevels(10);

  if (topUsers.length === 0) {
    const emptyEmbed = new EmbedBuilder()
      .setColor(0x8B5CF6) // Roxo Violeta
      .setTitle('🏆 Ranking de Níveis de Voz — Top 10')
      .setDescription(
        'Nenhum dado de nível registrado ainda.\n' +
        'O ranking será preenchido assim que os usuários começarem a ganhar XP em voz!'
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [emptyEmbed] });
  }

  // Constrói a lista do leaderboard
  const leaderboard = topUsers.map((user, index) => {
    const position = index < 3 ? MEDALS[index] : `**${index + 1}.**`;
    const lvl = getLevelData(user.total_presence_time, user.total_speaking_time);

    return (
      `${position} **${user.username}**\n` +
      `   ⚡ **Nível ${lvl.level}** · 🔮 \`${lvl.xp}\` XP · *${lvl.rank}*`
    );
  });

  const embed = new EmbedBuilder()
    .setColor(0x8B5CF6) // Roxo Violeta
    .setTitle('🏆 Ranking de Níveis de Voz — Top 10')
    .setDescription(leaderboard.join('\n\n'))
    .setFooter({
      text: `Solicitado por ${interaction.user.username} · ${topUsers.length} usuários no ranking`,
      iconURL: interaction.user.displayAvatarURL({ size: 32 }),
    })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}
