// ============================================
// commands/level.js — Comando /level
// ============================================
// Mostra o perfil completo de voz de um usuário.

import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getUserMetrics, getUserBadges, getBestFriend } from '../database.js';
import { getLevelData, renderProgressBar } from '../utils/levels.js';
import { formatTime, speakingPercentage } from '../utils/formatTime.js';
import { LOOT_TABLE, getCurrentBadgeInfo, syncMemberNicknameBadges } from '../utils/lootSystem.js';

export const data = new SlashCommandBuilder()
  .setName('level')
  .setDescription('Mostra o perfil completo de voz, nível, estatísticas e conquistas.')
  .addUserOption((option) =>
    option
      .setName('usuario')
      .setDescription('Usuário para consultar o perfil (padrão: você mesmo)')
      .setRequired(false)
  );

function getLevelEmbedsAndComponents(authorId, targetUser, metrics, badges, bestFriend, activePage) {
  // Cálculos de Nível e Progresso
  const lvl = getLevelData(metrics.total_presence_time, metrics.total_speaking_time, metrics.bonus_xp || 0);
  const progressBar = renderProgressBar(lvl.progressPercent, 15);
  
  // Formatação de Tempos
  const presenceFormatted = formatTime(metrics.total_presence_time);
  const speakingFormatted = formatTime(metrics.total_speaking_time);
  const percentage = speakingPercentage(metrics.total_speaking_time, metrics.total_presence_time);

  // Barra de Eficiência (Fala / Presença)
  const barLength = 15;
  const filledCount = Math.round(
    (metrics.total_speaking_time / Math.max(metrics.total_presence_time, 1)) * barLength
  );
  const filled = '█'.repeat(Math.min(filledCount, barLength));
  const empty = '░'.repeat(barLength - Math.min(filledCount, barLength));
  const efficiencyBar = `\`${filled}${empty}\` ${percentage}`;

  // Formata as badges para exibir no inventário
  let badgesDisplay = 'Nenhuma conquista desbloqueada ainda. Fale mais para dropar loot!';
  if (badges && badges.length > 0) {
    const badgeCounts = {};
    badges.forEach(b => {
      if (!badgeCounts[b.badge_name]) {
        badgeCounts[b.badge_name] = { icon: b.badge_icon, count: 0 };
      }
      badgeCounts[b.badge_name].count++;
    });

    badgesDisplay = Object.entries(badgeCounts).map(([name, data]) => {
      const loot = LOOT_TABLE.find(l => l.name === name);
      let displayIcon = data.icon;
      let displayName = name;

      if (loot) {
        const badgeInfo = getCurrentBadgeInfo(loot, data.count);
        displayIcon = badgeInfo.icon;
        displayName = badgeInfo.name;
      }

      if (data.count > 1) {
        return `• ${displayIcon} **${displayName}** (x${data.count})`;
      }
      return `• ${displayIcon} **${displayName}**`;
    }).join('\n');
  }

  // Informação do Melhor Amigo
  let bestFriendDisplay = 'Ainda não passou tempo com ninguém.';
  if (bestFriend) {
    const timeTogether = formatTime(bestFriend.time);
    const hours = bestFriend.time / 3600;
    
    let hearts = '❤️🤍🤍🤍🤍';
    let status = 'Conhecidos';
    if (hours >= 50) {
      hearts = '❤️❤️❤️❤️❤️';
      status = 'Alma Gêmea';
    } else if (hours >= 15) {
      hearts = '❤️❤️❤️❤️🤍';
      status = 'Melhores Amigos';
    } else if (hours >= 5) {
      hearts = '❤️❤️❤️🤍🤍';
      status = 'Amigos de Call';
    } else if (hours >= 1) {
      hearts = '❤️❤️🤍🤍🤍';
      status = 'Parceiros de Papo';
    }
    
    bestFriendDisplay = `<@${bestFriend.id}>\n${hearts} **${status}**\n*(Juntos por \`${timeTogether}\`)*`;
  }

  const containerComponents = [];

  // Top Section (Title + Avatar thumbnail as accessory)
  containerComponents.push({
    type: 9, // SECTION
    components: [
      {
        type: 10, // Text Display
        content: activePage === 'stats'
          ? `# 👤 Perfil de Voz - ${targetUser.displayName || targetUser.username}`
          : activePage === 'badges'
            ? `# 🎒 Inventário de Conquistas`
            : `# 🤝 Melhor Companhia`
      }
    ],
    accessory: {
      type: 11, // THUMBNAIL
      media: {
        url: targetUser.displayAvatarURL({ size: 128, extension: 'png' })
      },
      description: 'Avatar do usuário'
    }
  });

  containerComponents.push({
    type: 14, // Separator
    divider: true,
    spacing: 1
  });

  if (activePage === 'stats') {
    containerComponents.push(
      {
        type: 10,
        content: `### 🛡️ Patente de Voz\n**${lvl.rank}**\n\n` +
          `### ✨ Nível Atual\n⚡ **Nível ${lvl.level}**\n\n` +
          `### 🧪 XP Acumulado\n🔮 \`${lvl.xp}\` XP total\n\n` +
          `### 🪙 Saldo na Carteira\n💰 \`${metrics.voice_coins || 0}\` Voice Coins`
      },
      {
        type: 14,
        divider: true,
        spacing: 1
      },
      {
        type: 10,
        content: `### 📈 Progresso para o Próximo Nível\n${progressBar}\n*(Progresso: \`${lvl.xpInCurrentLevel}\` / \`${lvl.xpNeededForNextLevel}\` XP)*`
      },
      {
        type: 14,
        divider: true,
        spacing: 1
      },
      {
        type: 10,
        content: `### 🎧 Presença Total\n\`${presenceFormatted}\`\n\n` +
          `### 🗣️ Fala Real\n\`${speakingFormatted}\`\n\n` +
          `### 📊 Eficiência de Conversa\n${efficiencyBar}\n\n` +
          `### 🕐 Última Conexão\n` + (metrics.last_connected ? `<t:${Math.floor(new Date(metrics.last_connected).getTime() / 1000)}:R>` : 'Nunca')
      }
    );
  } else if (activePage === 'badges') {
    containerComponents.push({
      type: 10,
      content: `Conquistas obtidas por **${targetUser.displayName || targetUser.username}** nos canais de voz.\n\n${badgesDisplay}`
    });
  } else if (activePage === 'friend') {
    containerComponents.push({
      type: 10,
      content: `### 👤 Parceiro de Call\n${bestFriendDisplay}`
    });
  }

  containerComponents.push(
    {
      type: 14,
      divider: true,
      spacing: 1
    },
    {
      type: 10,
      content: `*Página: ${activePage === 'stats' ? 'Estatísticas' : activePage === 'badges' ? 'Conquistas' : 'Melhor Companhia'} · Solicitado por ${targetUser.username}*`
    }
  );

  const btnStats = new ButtonBuilder()
    .setCustomId(`level:stats:${authorId}:${targetUser.id}`)
    .setLabel('Estatísticas')
    .setEmoji('📊')
    .setStyle(activePage === 'stats' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    .setDisabled(activePage === 'stats');

  const btnBadges = new ButtonBuilder()
    .setCustomId(`level:badges:${authorId}:${targetUser.id}`)
    .setLabel('Conquistas')
    .setEmoji('🎒')
    .setStyle(activePage === 'badges' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    .setDisabled(activePage === 'badges');

  const btnFriend = new ButtonBuilder()
    .setCustomId(`level:friend:${authorId}:${targetUser.id}`)
    .setLabel('Melhor Companhia')
    .setEmoji('🤝')
    .setStyle(activePage === 'friend' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    .setDisabled(activePage === 'friend');

  const row = new ActionRowBuilder().addComponents(btnStats, btnBadges, btnFriend);

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

  const targetUser = interaction.options.getUser('usuario') || interaction.user;

  // Sincroniza apelido forçadamente
  const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (member) {
    await syncMemberNicknameBadges(member, true).catch(() => null);
  }

  // Busca métricas, badges e melhor amigo em paralelo
  const [metrics, badges, bestFriend] = await Promise.all([
    getUserMetrics(targetUser.id),
    getUserBadges(targetUser.id),
    getBestFriend(targetUser.id)
  ]);

  if (!metrics) {
    return interaction.editReply({
      flags: 32768,
      components: [
        {
          type: 17, // CONTAINER
          accent_color: 9133302,
          components: [
            {
              type: 9, // SECTION
              components: [
                {
                  type: 10,
                  content: `# 👤 Perfil de Voz - ${targetUser.displayName || targetUser.username}`
                }
              ],
              accessory: {
                type: 11,
                media: {
                  url: targetUser.displayAvatarURL({ size: 128, extension: 'png' })
                },
                description: 'Avatar do usuário'
              }
            },
            {
              type: 14,
              divider: true,
              spacing: 1
            },
            {
              type: 10,
              content: `${targetUser} ainda não possui dados registrados.\nO rastreamento começa quando o usuário entra em um canal de voz.`
            }
          ]
        }
      ]
    });
  }

  const payload = getLevelEmbedsAndComponents(interaction.user.id, targetUser, metrics, badges, bestFriend, 'stats');
  return interaction.editReply(payload);
}

export async function handleInteraction(interaction, args) {
  const [activePage, authorId, targetId] = args;

  if (interaction.user.id !== authorId) {
    return interaction.reply({
      content: '❌ Apenas o autor do comando pode navegar pelas abas.',
      ephemeral: true
    });
  }

  await interaction.deferUpdate();

  try {
    const targetUser = await interaction.client.users.fetch(targetId).catch(() => null);
    if (!targetUser) return;

    const [metrics, badges, bestFriend] = await Promise.all([
      getUserMetrics(targetId),
      getUserBadges(targetId),
      getBestFriend(targetId)
    ]);

    if (!metrics) return;

    const payload = getLevelEmbedsAndComponents(authorId, targetUser, metrics, badges, bestFriend, activePage);
    await interaction.editReply(payload);
  } catch (error) {
    console.error('Erro ao processar interação em level:', error);
  }
}
