// ============================================
// commands/conquistas.js — Comando /conquistas
// ============================================
// Exibe as estatísticas globais de raridade de todas
// as conquistas do bot, junto com as instruções de obtenção.

import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { getBadgeRarityStats } from '../database.js';
import { LOOT_TABLE } from '../utils/lootSystem.js';

const BADGE_DESCRIPTIONS = {
  'coruja': 'Falar em canais de voz entre 02:00 e 05:00 da madrugada.',
  'onfire': 'Falar por mais de 5 minutos acumulados em uma mesma chamada (chance de drop ao atingir a marca).',
  'tagarela': 'Falar por mais de 2 minutos acumulados em uma mesma chamada (chance de drop ao atingir a marca).',
  'sortudo': 'Drop de chance pura ao sair da call ou parar de falar.',
  'fantasma': 'Falar durante a meia-noite (entre 00:00 e 00:59).',
  'cafe': 'Falar das 06:00 às 09:00 da manhã.',
  'orador': 'Falar por mais de 10 minutos acumulados em uma mesma chamada (chance de drop ao atingir a marca).',
  'velocista': 'Falar de forma super rápida (entre 5 e 8 segundos).',
  'sabado': 'Falar nas noites de sexta ou sábado (entre 22:00 e 03:00).',
  'maratonista': 'Permanecer por mais de 3 horas conectado em uma única chamada.',
  'ouvinte': 'Permanecer por mais de 1 hora na chamada apenas ouvindo (falou menos de 10 segundos).',
  'silencio': 'Permanecer por mais de 2 horas em silêncio absoluto (sem falar) na chamada.',
  'astrocram': 'Permanecer com a câmera ligada por mais de 30 minutos em uma única chamada.',
  'maratonistacam': 'Permanecer com a câmera ligada por mais de 1 hora em uma única chamada.'
};

export const data = new SlashCommandBuilder()
  .setName('conquistas')
  .setDescription('Exibe as estatísticas de raridade das conquistas e como ganhar cada uma.');

function getConquistasPayload(authorId, selectedValue, rarityStats, username, avatarURL) {
  const totalDrops = Object.values(rarityStats).reduce((sum, val) => sum + val, 0) || 1;
  const embed = new EmbedBuilder().setTimestamp();

  if (!selectedValue || selectedValue === 'general') {
    embed
      .setColor(0x8B5CF6) // Roxo Violeta
      .setTitle('🏆 Guia de Conquistas e Raridade (Loot Drops)')
      .setDescription(
        'Aqui estão todas as conquistas secretas que você pode dropar enquanto fala nos canais de voz, ' +
        'as regras de evolução de apelido e a frequência global delas no servidor.'
      );

    for (const loot of LOOT_TABLE) {
      const count = rarityStats[loot.name] || 0;
      const percentage = ((count / totalDrops) * 100).toFixed(1);
      const desc = BADGE_DESCRIPTIONS[loot.id] || 'Condição desconhecida.';
      
      const t1 = loot.icon;
      const t2 = loot.evolutions[0].icon;
      const t3 = loot.evolutions[1].icon;

      embed.addFields({
        name: `${loot.icon} ${loot.name}`,
        value: 
          `> 💡 **Como obter:** ${desc}\n` +
          `> 📈 **Evolução:** ${t1} (Base) ➔ ${t2} (Tier 2, 5x) ➔ ${t3} (Tier 3, 20x)\n` +
          `> 📊 **Frequência:** \`${count}\` drops no total (~${percentage}%)`,
        inline: false
      });
    }

    embed.setFooter({
      text: `Total de conquistas concedidas no servidor: ${totalDrops} · Solicitado por ${username}`,
      iconURL: avatarURL
    });
  } else {
    const loot = LOOT_TABLE.find(l => l.id === selectedValue);
    if (loot) {
      const count = rarityStats[loot.name] || 0;
      const percentage = ((count / totalDrops) * 100).toFixed(1);
      const desc = BADGE_DESCRIPTIONS[loot.id] || 'Condição desconhecida.';

      const t1 = loot.icon;
      const t2 = loot.evolutions[0].icon;
      const t3 = loot.evolutions[1].icon;

      embed
        .setColor(0x8B5CF6)
        .setTitle(`${loot.icon} Detalhes da Conquista: ${loot.name}`)
        .setDescription(`💡 **Regra de Obtenção:**\n${desc}`)
        .addFields(
          {
            name: '⭐ Nível Base (Tier 1)',
            value: `Ícone: ${t1}\nNome: **${loot.name}**\nRequisito: Obter a conquista 1 vez.`,
            inline: true
          },
          {
            name: '🌟 Nível Intermediário (Tier 2)',
            value: `Ícone: ${t2}\nNome: **${loot.evolutions[0].name}**\nRequisito: Acumular 5 drops desta conquista.`,
            inline: true
          },
          {
            name: '🌌 Nível Divino (Tier 3)',
            value: `Ícone: ${t3}\nNome: **${loot.evolutions[1].name}**\nRequisito: Acumular 20 drops desta conquista.`,
            inline: true
          },
          {
            name: '📊 Raridade e Estatísticas',
            value: `🔹 Total de drops no servidor: \`${count}\` vezes.\n🔹 Frequência global: \`${percentage}%\` de todos os drops.`,
            inline: false
          }
        )
        .setFooter({
          text: `Visualizando detalhes de ${loot.name} · Solicitado por ${username}`,
          iconURL: avatarURL
        });
    }
  }

  // Cria o menu de seleção
  const menuOptions = [
    {
      label: 'Guia Geral (Resumo)',
      description: 'Volta para a lista resumida de todas as conquistas.',
      value: 'general',
      emoji: '🏆'
    },
    ...LOOT_TABLE.map(loot => ({
      label: loot.name,
      description: BADGE_DESCRIPTIONS[loot.id]?.substring(0, 50) || '',
      value: loot.id,
      emoji: loot.icon
    }))
  ];

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`conquistas:select:${authorId}`)
    .setPlaceholder('Selecione uma conquista para ver detalhes...')
    .addOptions(menuOptions);

  const row = new ActionRowBuilder().addComponents(selectMenu);

  return { embeds: [embed], components: [row] };
}

export async function execute(interaction) {
  await interaction.deferReply();

  try {
    const rarityStats = await getBadgeRarityStats();
    const payload = getConquistasPayload(
      interaction.user.id,
      'general',
      rarityStats,
      interaction.user.username,
      interaction.user.displayAvatarURL({ size: 32 })
    );

    await interaction.editReply(payload);
  } catch (error) {
    console.error('Erro ao executar /conquistas:', error);
    await interaction.editReply('❌ Ocorreu um erro ao carregar as estatísticas das conquistas.');
  }
}

export async function handleInteraction(interaction, args) {
  const [action, authorId] = args;

  if (interaction.user.id !== authorId) {
    return interaction.reply({
      content: '❌ Apenas quem usou o comando pode interagir com o menu.',
      ephemeral: true
    });
  }

  if (action === 'select') {
    await interaction.deferUpdate();
    try {
      const selectedValue = interaction.values[0];
      const rarityStats = await getBadgeRarityStats();
      const payload = getConquistasPayload(
        authorId,
        selectedValue,
        rarityStats,
        interaction.user.username,
        interaction.user.displayAvatarURL({ size: 32 })
      );

      await interaction.editReply(payload);
    } catch (error) {
      console.error('Erro ao processar interação em conquistas:', error);
    }
  }
}
