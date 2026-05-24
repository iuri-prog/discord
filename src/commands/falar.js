// ============================================
// commands/falar.js — Comando /falar
// ============================================
// Faz o bot falar um texto personalizado no canal de voz.

import { SlashCommandBuilder } from 'discord.js';
import { getGuildConnection } from '../voiceManager.js';
import { speakText } from '../utils/speech.js';

export const data = new SlashCommandBuilder()
  .setName('falar')
  .setDescription('Faz o bot falar um texto personalizado no canal de voz atual.')
  .addStringOption((option) =>
    option
      .setName('mensagem')
      .setDescription('O texto que o bot irá falar (máx 200 caracteres)')
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName('idioma')
      .setDescription('O idioma/voz para a fala (padrão: Português)')
      .setRequired(false)
      .addChoices(
        { name: 'Português', value: 'pt-BR' },
        { name: 'Latim Medonho', value: 'la' }
      )
  );

export async function execute(interaction) {
  const text = interaction.options.getString('mensagem');
  const lang = interaction.options.getString('idioma') || 'pt-BR';
  const guildId = interaction.guildId;

  // Busca a conexão ativa do bot no servidor
  const connection = getGuildConnection(guildId);

  if (!connection) {
    return interaction.reply({
      content: '❌ O bot não está conectado a nenhum canal de voz neste servidor no momento. Entre em uma chamada com outros membros e o bot entrará automaticamente para que você possa usar o comando.',
      ephemeral: true,
    });
  }

  // Defer para processar
  await interaction.deferReply({ ephemeral: true });

  try {
    const player = speakText(connection, text, lang);

    if (player) {
      return interaction.editReply({
        content: `🗣️ Falando no canal de voz: *"${text}"*`,
      });
    } else {
      return interaction.editReply({
        content: '❌ Ocorreu um erro ao gerar a voz (TTS).',
      });
    }
  } catch (error) {
    console.error('❌ Erro no comando /falar:', error);
    return interaction.editReply({
      content: '❌ Ocorreu um erro inesperado ao reproduzir a fala.',
    });
  }
}
