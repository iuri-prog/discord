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
  const containerComponents = [];

  if (!selectedValue || selectedValue === 'general') {
    containerComponents.push({
      type: 10, // Text Display
      content: `# 🏆 Guia de Conquistas e Raridade (Loot Drops)\nAqui estão todas as conquistas secretas que você pode dropar enquanto fala nos canais de voz, as regras de evolução de apelido e a frequência global delas no servidor.\n\n*Total de conquistas concedidas no servidor: \`${totalDrops}\`*`
    });

    containerComponents.push({
      type: 14, // Separator
      divider: true,
      spacing: 1
    });

    for (const loot of LOOT_TABLE) {
      const count = rarityStats[loot.name] || 0;
      const percentage = ((count / totalDrops) * 100).toFixed(1);
      const desc = BADGE_DESCRIPTIONS[loot.id] || 'Condição desconhecida.';
      
      const t1 = loot.icon;
      const t2 = loot.evolutions[0].icon;
      const t3 = loot.evolutions[1].icon;

      containerComponents.push({
        type: 10, // Text Display
        content: `### ${loot.icon} ${loot.name}\n` +
          `> 💡 **Como obter:** ${desc}\n` +
          `> 📈 **Evolução:** ${t1} (Base) ➔ ${t2} (Tier 2, 5x) ➔ ${t3} (Tier 3, 10x)\n` +
          `> 📊 **Frequência:** \`${count}\` drops (~${percentage}%)`
      });
    }
  } else {
    const loot = LOOT_TABLE.find(l => l.id === selectedValue);
    if (loot) {
      const count = rarityStats[loot.name] || 0;
      const percentage = ((count / totalDrops) * 100).toFixed(1);
      const desc = BADGE_DESCRIPTIONS[loot.id] || 'Condição desconhecida.';

      const t1 = loot.icon;
      const t2 = loot.evolutions[0].icon;
      const t3 = loot.evolutions[1].icon;

      containerComponents.push(
        {
          type: 10,
          content: `## ${loot.icon} Detalhes da Conquista: ${loot.name}\n💡 **Regra de Obtenção:**\n${desc}`
        },
        {
          type: 14,
          divider: true,
          spacing: 1
        },
        {
          type: 10,
          content: `### ⭐ Nível Base (Tier 1)\nÍcone: ${t1}\nNome: **${loot.name}**\nRequisito: Obter a conquista 1 vez.\n\n` +
            `### 🌟 Nível Intermediário (Tier 2)\nÍcone: ${t2}\nNome: **${loot.evolutions[0].name}**\nRequisito: Acumular 5 drops desta conquista.\n\n` +
            `### 🌌 Nível Divino (Tier 3)\nÍcone: ${t3}\nNome: **${loot.evolutions[1].name}**\nRequisito: Acumular 10 drops desta conquista.`
        },
        {
          type: 14,
          divider: true,
          spacing: 1
        },
        {
          type: 10,
          content: `### 📊 Raridade e Estatísticas\n🔹 Total de drops no servidor: \`${count}\` vezes.\n🔹 Frequência global: \`${percentage}%\` de todos os drops.`
        }
      );
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

  return {
    flags: 32768, // IS_COMPONENTS_V2
    components: [
      {
        type: 17, // CONTAINER
        accent_color: 9133302, // 0x8B5CF6
        components: containerComponents
      },
      row.toJSON()
    ]
  };
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
    await interaction.editReply({
      content: '❌ Ocorreu um erro ao carregar as estatísticas das conquistas.'
    });
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
