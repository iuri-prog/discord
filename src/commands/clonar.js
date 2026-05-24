// ============================================
// commands/clonar.js — Comando /clonar
// ============================================
// Clona uma frase icônica/engraçada de um membro para o bot repetir de vez em quando.

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { saveQuote } from '../database.js';

export const data = new SlashCommandBuilder()
  .setName('clonar')
  .setDescription('Clona uma frase icônica/engraçada de um membro para o bot repetir depois.')
  .addUserOption((option) =>
    option
      .setName('membro')
      .setDescription('O membro que falou a frase')
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName('frase')
      .setDescription('A frase dita por ele (máx 200 caracteres)')
      .setRequired(true)
  );

export async function execute(interaction) {
  const targetUser = interaction.options.getUser('membro');
  const phrase = interaction.options.getString('frase');

  // Valida tamanho
  if (phrase.length > 200) {
    return interaction.reply({
      content: '❌ A frase não pode conter mais de 200 caracteres.',
      ephemeral: true
    });
  }

  // Defer
  await interaction.deferReply();

  try {
    const member = await interaction.guild.members.fetch(targetUser.id);
    const authorName = member ? member.displayName : targetUser.username;

    // Salva a citação no banco/arquivo local
    const success = await saveQuote(authorName, phrase);

    if (success) {
      const embed = new EmbedBuilder()
        .setColor(0x8B5CF6) // Roxo Violeta
        .setTitle('📥 Frase Clonada com Sucesso!')
        .setDescription(
          `A frase foi salva no banco de memórias do bot e poderá ser repetida de tempos em tempos:\n\n` +
          `🗣️ *"${phrase}"* — **${authorName}**`
        )
        .setFooter({
          text: `Clonado por ${interaction.user.username}`,
          iconURL: interaction.user.displayAvatarURL({ size: 32 })
        })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    } else {
      return interaction.editReply({
        content: '❌ Ocorreu um erro ao salvar a citação.'
      });
    }
  } catch (error) {
    console.error('❌ Erro no comando /clonar:', error);
    return interaction.editReply({
      content: '❌ Ocorreu um erro ao clonar a frase.'
    });
  }
}
