// ============================================
// commands/level.js — Comando /level
// ============================================
// Mostra o nível de voz, XP, patente e progresso de um usuário.

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getUserMetrics } from '../database.js';
import { getLevelData, renderProgressBar } from '../utils/levels.js';
import { formatTime } from '../utils/formatTime.js';

export const data = new SlashCommandBuilder()
  .setName('level')
  .setDescription('Mostra o seu nível de voz, XP e patente no servidor.')
  .addUserOption((option) =>
    option
      .setName('usuario')
      .setDescription('Usuário para consultar o nível (padrão: você mesmo)')
      .setRequired(false)
  );

export async function execute(interaction) {
  await interaction.deferReply();

  const targetUser = interaction.options.getUser('usuario') || interaction.user;
  const metrics = await getUserMetrics(targetUser.id);

  if (!metrics) {
    const emptyEmbed = new EmbedBuilder()
      .setColor(0x8B5CF6) // Roxo Violeta
      .setTitle('🎙️ Sistema de Níveis de Voz')
      .setDescription(
        `${targetUser} ainda não possui dados registrados.\n` +
        `O ganho de XP e níveis começa assim que você entra em um canal de voz!`
      )
      .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
      .setTimestamp();

    return interaction.editReply({ embeds: [emptyEmbed] });
  }

  const lvl = getLevelData(metrics.total_presence_time, metrics.total_speaking_time);
  const progressBar = renderProgressBar(lvl.progressPercent, 15);
  
  const presenceFormatted = formatTime(metrics.total_presence_time);
  const speakingFormatted = formatTime(metrics.total_speaking_time);

  const embed = new EmbedBuilder()
    .setColor(0x8B5CF6) // Roxo Violeta
    .setTitle('🎙️ Nível de Voz')
    .setDescription(`Perfil de voz e XP de **${targetUser.displayName || targetUser.username}**`)
    .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
    .addFields(
      {
        name: '🛡️ Patente de Voz',
        value: `**${lvl.rank}**`,
        inline: true,
      },
      {
        name: '✨ Nível Atual',
        value: `⚡ **Nível ${lvl.level}**`,
        inline: true,
      },
      {
        name: '🧪 XP Acumulado',
        value: `🔮 \`${lvl.xp}\` XP total`,
        inline: true,
      },
      {
        name: '📈 Progresso para o Próximo Nível',
        value: `${progressBar}\n*(Progresso: \`${lvl.xpInCurrentLevel}\` / \`${lvl.xpNeededForNextLevel}\` XP)*`,
        inline: false,
      },
      {
        name: '🎧 Presença em Canal',
        value: `\`${presenceFormatted}\` *(+${Math.floor(metrics.total_presence_time)} XP)*`,
        inline: true,
      },
      {
        name: '🗣️ Fala Real (3x XP)',
        value: `\`${speakingFormatted}\` *(+${Math.floor(metrics.total_speaking_time * 3)} XP)*`,
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
