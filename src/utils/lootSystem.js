// ============================================
// utils/lootSystem.js — Motor de Drops e Badges
// ============================================

import { awardBadge, getUserBadges, addSpeakingTime, updateDatabaseUsername, getBadgeRarityStats } from '../database.js';
// Cache em memória para garantir que não haja drops repetidos mesmo com delay/erro no Supabase
const pendingAwards = new Set(); // Formato: 'userId:badgeName'


/**
 * Tabela de Drops Dinâmicos (Loot).
 * 'chance' é o percentual base de chance por tentativa (0 a 1).
 * 'condition' avalia se o usuário está elegível naquele momento.
 * 'evolutions' define os estágios de evolução quando o usuário acumula conquistas do mesmo tipo.
 */
export const LOOT_TABLE = [
  {
    id: 'coruja',
    icon: '🦉',
    name: 'Coruja da Madrugada',
    tag: '🦉',
    chance: 0.05, // 5% de chance
    condition: () => {
      const hora = new Date().getHours();
      return hora >= 2 && hora <= 5; // Entre 2 AM e 5 AM
    },
    evolutions: [
      { threshold: 5, icon: '🔮', name: 'Coruja Arcana', tag: '🔮' },
      { threshold: 20, icon: '🌌', name: 'Guardião Cósmico', tag: '🌌' }
    ]
  },
  {
    id: 'onfire',
    icon: '🔥',
    name: 'Máquina de Falar',
    tag: '🔥',
    chance: 0.02, // 2% de chance
    condition: (speakDurationSeconds) => {
      return speakDurationSeconds > 300; // Falou por mais de 5 minutos direto
    },
    evolutions: [
      { threshold: 5, icon: '🌋', name: 'Vulcão Vocal', tag: '🌋' },
      { threshold: 20, icon: '☄️', name: 'Supernova Solar', tag: '☄️' }
    ]
  },
  {
    id: 'tagarela',
    icon: '🗣️',
    name: 'Tagarela Inveterado',
    tag: '🗣️',
    chance: 0.03, // 3% de chance
    condition: (speakDurationSeconds) => {
      return speakDurationSeconds > 120 && speakDurationSeconds <= 300; // Entre 2 e 5 mins diretos
    },
    evolutions: [
      { threshold: 5, icon: '📢', name: 'Voz Sônica', tag: '📢' },
      { threshold: 20, icon: '📣', name: 'Lorde da Garganta', tag: '📣' }
    ]
  },
  {
    id: 'sortudo',
    icon: '🎲',
    name: 'Sortudo do Microfone',
    tag: '🎲',
    chance: 0.005, // 0.5% de chance (muito raro)
    condition: () => true, // Pode dropar a qualquer momento que a pessoa pare de falar
    evolutions: [
      { threshold: 5, icon: '🃏', name: 'Mestre das Cartas', tag: '🃏' },
      { threshold: 20, icon: '🎰', name: 'Jackpot Lendário', tag: '🎰' }
    ]
  },
  {
    id: 'fantasma',
    icon: '👻',
    name: 'Fantasma Tagarela',
    tag: '👻',
    chance: 0.01, // 1% de chance
    condition: (speakDurationSeconds) => {
      const hora = new Date().getHours();
      return hora === 0; // Dropa à Meia-noite (hora das bruxas)
    },
    evolutions: [
      { threshold: 5, icon: '💀', name: 'Espectro de Fogo', tag: '💀' },
      { threshold: 20, icon: '👹', name: 'Ceifador de Almas', tag: '👹' }
    ]
  },
  {
    id: 'cafe',
    icon: '☕',
    name: 'Bom Dia, Vietnam!',
    tag: '☕',
    chance: 0.03, // 3% de chance
    condition: () => {
      const hora = new Date().getHours();
      return hora >= 6 && hora <= 9; // Drop matinal
    },
    evolutions: [
      { threshold: 5, icon: '🥐', name: 'Desjejum do Guerreiro', tag: '🥐' },
      { threshold: 20, icon: '☀️', name: 'Soberano da Manhã', tag: '☀️' }
    ]
  },
  {
    id: 'orador',
    icon: '🎙️',
    name: 'O Grande Orador',
    tag: '🎙️',
    chance: 0.08, // 8% de chance
    condition: (speakDurationSeconds) => {
      return speakDurationSeconds >= 600; // Falou por mais de 10 minutos diretos!
    },
    evolutions: [
      { threshold: 5, icon: '🎭', name: 'Poeta da Madrugada', tag: '🎭' },
      { threshold: 20, icon: '🏛️', name: 'Lorde do Senado', tag: '🏛️' }
    ]
  },
  {
    id: 'velocista',
    icon: '⚡',
    name: 'Velocista Vocal',
    tag: '⚡',
    chance: 0.02, // 2% de chance
    condition: (speakDurationSeconds) => {
      return speakDurationSeconds >= 5 && speakDurationSeconds <= 8; // Falas muito rápidas, mas válidas
    },
    evolutions: [
      { threshold: 5, icon: '🌀', name: 'Ciclone Sônico', tag: '🌀' },
      { threshold: 20, icon: '🛸', name: 'Velocidade da Luz', tag: '🛸' }
    ]
  },
  {
    id: 'sabado',
    icon: '🍻',
    name: 'Inimigo do Fim',
    tag: '🍻',
    chance: 0.04, // 4% de chance
    condition: () => {
      const day = new Date().getDay();
      const hour = new Date().getHours();
      // Dropa sexta à noite ou sábado à noite (após 22h)
      return (day === 5 || day === 6) && (hour >= 22 || hour <= 3);
    },
    evolutions: [
      { threshold: 5, icon: '🥂', name: 'Celebrante de Elite', tag: '🥂' },
      { threshold: 20, icon: '🍾', name: 'Lorde da Taberna', tag: '🍾' }
    ]
  }
];

/**
 * Retorna os dados do nível atual da conquista com base no número de acumulações.
 * @param {Object} loot - Objeto da conquista original da LOOT_TABLE
 * @param {number} timesEarned - Quantidade de vezes que a conquista foi obtida
 * @returns {Object} Dados atualizados { icon, name, tag }
 */
export function getCurrentBadgeInfo(loot, timesEarned) {
  let activeIcon = loot.icon;
  let activeName = loot.name;
  let activeTag = loot.tag;

  if (loot.evolutions && loot.evolutions.length > 0) {
    const sortedEvolutions = [...loot.evolutions].sort((a, b) => b.threshold - a.threshold);
    const activeEvolution = sortedEvolutions.find(ev => timesEarned >= ev.threshold);
    if (activeEvolution) {
      activeIcon = activeEvolution.icon;
      activeName = activeEvolution.name;
      activeTag = activeEvolution.tag;
    }
  }

  return { icon: activeIcon, name: activeName, tag: activeTag };
}

/**
 * Tenta dropar um loot para o usuário baseado na sorte e condições.
 * @param {import('discord.js').Client} client 
 * @param {string} guildId 
 * @param {string} channelId 
 * @param {string} userId 
 * @param {string} username 
 * @param {number} speakDurationSeconds 
 */
export async function evaluateLootDrop(client, guildId, channelId, userId, username, speakDurationSeconds) {
  // Ignorar falas muito curtas (menos de 5 segundos) para não spammar rolagens
  if (speakDurationSeconds < 5) return;

  // Busca conquistas atuais para não dar o mesmo loot duplicado (opcional, mas recomendado)
  const existingBadges = await getUserBadges(userId);
  const earnedBadgeIds = existingBadges.map(b => b.badge_name); // Vamos checar pelo nome

  // Avaliar loots elegíveis
  const eligibleLoots = LOOT_TABLE.filter(loot => 
    loot.condition(speakDurationSeconds) && 
    !pendingAwards.has(`${userId}:${loot.name}`) // Bloqueio imediato no cache
  );

  if (eligibleLoots.length === 0) return; // Não há loots possíveis

  // Rolagem de dados (RNG)
  for (const loot of eligibleLoots) {
    const roll = Math.random(); // Gera número entre 0 e 1
    
    // Se a rolagem for menor ou igual à chance (ex: 0.04 <= 0.05) -> VENCEU!
    if (roll <= loot.chance) {
      const isDuplicate = earnedBadgeIds.includes(loot.name);
      const timesEarned = existingBadges.filter(b => b.badge_name === loot.name).length + 1;

      console.log(`🎁 [LOOT DROP] ${username} ${isDuplicate ? 'evoluiu' : 'ganhou'} a conquista: ${loot.name} (Nível ${timesEarned})`);
      
      // Trava no cache local IMEDIATAMENTE e solta depois de 60s
      const cacheKey = `${userId}:${loot.name}`;
      pendingAwards.add(cacheKey);
      setTimeout(() => pendingAwards.delete(cacheKey), 60000);

      // Salva no banco de dados
      await awardBadge(userId, username, loot.icon, loot.name, loot.tag);

      // Concede 1000 XP bônus (334 segundos de fala real * 3) se for repetido
      if (isDuplicate) {
        await addSpeakingTime(userId, username, 334);
      }

      // Dispara a recompensa visual no Discord
      await announceLootDrop(client, guildId, channelId, userId, loot, isDuplicate, timesEarned);
      
      // Garante que só ganhe 1 loot por avaliação
      break; 
    }
  }
}

/**
 * Anuncia no servidor e muda o apelido temporariamente (ou adiciona a tag).
 */
async function announceLootDrop(client, guildId, channelId, userId, loot, isDuplicate = false, timesEarned = 1) {
  try {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) return;

    // Buscar o membro para mudar o apelido
    const member = await guild.members.fetch(userId);
    
    // Enviar mensagem no chat de texto vinculado ao canal de voz (se possível)
    const channel = await guild.channels.fetch(channelId);
    
    const currentBadge = getCurrentBadgeInfo(loot, timesEarned);
    const activeEvolution = (loot.evolutions || []).find(ev => ev.threshold === timesEarned);

    let messageContent = '';
    if (activeEvolution) {
      messageContent = `⚡ **EVOLUÇÃO LENDÁRIA!** ${member.user} superou as expectativas e evoluiu sua conquista **${loot.name}** para **${activeEvolution.icon} ${activeEvolution.name}** (Nível ${timesEarned})!\nGanhou \`+1000 XP\` de bônus!`;
    } else if (isDuplicate) {
      messageContent = `⚡ **EVOLUÇÃO ÉPICA!** ${member.user} acaba de evoluir sua conquista **${currentBadge.icon} ${currentBadge.name}** para o **Nível ${timesEarned}**!\nGanhou \`+1000 XP\` de bônus!`;
    } else {
      messageContent = `🎉 **DROP ÉPICO!** ${member.user} acaba de desbloquear uma nova conquista secreta: **${loot.icon} ${loot.name}**!\nUma tag especial \`${loot.tag}\` foi adicionada ao seu perfil!`;
    }

    let sentMessage = null;
    if (channel && channel.isTextBased()) { // A partir de certas atualizações, canais de voz têm chat de texto associado
      sentMessage = await channel.send({ content: messageContent });
    } else {
      // Se não conseguir mandar no chat do canal de voz, pode mandar no canal do sistema (systemChannel)
      if (guild.systemChannel) {
        sentMessage = await guild.systemChannel.send({ content: messageContent });
      }
    }

    // Apaga a mensagem automaticamente após 5 minutos (300000ms) para não acumular spam nos chats
    if (sentMessage) {
      setTimeout(() => {
        sentMessage.delete().catch(err => {
          console.warn(`[LOOT SYSTEM] Não foi possível deletar a mensagem de drop/conquista: ${err.message}`);
        });
      }, 300000);
    }

    // Sincronizar o nickname automaticamente com as conquistas do banco
    await syncMemberNicknameBadges(member);

    // Efeito sonoro desativado a pedido do usuário (remover som de passar de nível)
    /*
    try {
      await client.rest.post(`/channels/${channelId}/send-soundboard-sound`, {
        body: { sound_id: '1505797629412511834' }
      });
    } catch (soundError) {
      console.error('❌ Erro ao tocar som do Soundboard:', soundError.message);
    }
    */

  } catch (error) {
    console.error('❌ Erro ao processar recompensa visual do loot:', error.message);
  }
}

/**
 * Verifica as conquistas do usuário no banco de dados e sincroniza o nickname
 * garantindo que possua os ícones corretos de evolução de todas as conquistas obtidas.
 * @param {import('discord.js').GuildMember} member 
 */
export async function syncMemberNicknameBadges(member) {
  if (!member) return;

  const username = member.user?.username || member.id;
  const userId = member.id;
  const currentUsername = member.displayName || member.user?.username;

  try {
    const existingBadges = await getUserBadges(userId);

    // Checa se o username atual é diferente do cadastrado no banco para atualizar
    let dbUsername = null;
    if (existingBadges && existingBadges.length > 0) {
      dbUsername = existingBadges[0].username;
    }

    if (dbUsername && dbUsername !== currentUsername) {
      await updateDatabaseUsername(userId, currentUsername);
    }

    if (!member.manageable) {
      console.warn(`⚠️ [SYNC NICKNAME] Não é possível alterar o nickname de ${username} (Sem permissão do Discord / Hierarquia de Cargos / Dono do Servidor)`);
      return;
    }

    // Conta conquistas por nome base
    const badgeCounts = {};
    if (existingBadges && existingBadges.length > 0) {
      existingBadges.forEach(b => {
        badgeCounts[b.badge_name] = (badgeCounts[b.badge_name] || 0) + 1;
      });
    }

    let currentName = member.displayName;
    
    // Remove qualquer padrão de excedente [+x] ou [+ x] existente no apelido
    let cleanName = currentName.replace(/\[\+\s*\d+\]/g, '');
    
    // Remove TODOS os emojis do nome original (qualquer emoji não-conquista será deletado)
    cleanName = cleanName.replace(/\p{Extended_Pictographic}/gu, '');
    
    // Remove múltiplos espaços extras deixados pela remoção
    cleanName = cleanName.replace(/\s+/g, ' ').trim();

    // Coleciona as conquistas ativas do usuário e suas tags
    const activeBadgesList = [];
    for (const loot of LOOT_TABLE) {
      const count = badgeCounts[loot.name] || 0;
      if (count > 0) {
        const badgeInfo = getCurrentBadgeInfo(loot, count);
        activeBadgesList.push({
          name: loot.name,
          tag: badgeInfo.tag
        });
      }
    }

    // Busca estatísticas globais de raridade no banco de dados
    const rarityStats = await getBadgeRarityStats();

    // Ordena do mais raro para o mais comum (menor contagem global no banco = mais raro)
    activeBadgesList.sort((a, b) => {
      const countA = rarityStats[a.name] !== undefined ? rarityStats[a.name] : Infinity;
      const countB = rarityStats[b.name] !== undefined ? rarityStats[b.name] : Infinity;
      return countA - countB;
    });

    // Pega os 3 mais raros e calcula o excedente
    const displayBadges = activeBadgesList.slice(0, 3);
    const extraCount = activeBadgesList.length - 3;

    const tagsToDisplay = displayBadges.map(b => b.tag);
    let tagSuffix = tagsToDisplay.join(' ');
    if (extraCount > 0) {
      tagSuffix += ` [+${extraCount}]`;
    }

    // Junta as tags ativas ao final do nome limpo
    let newName = cleanName;
    if (tagsToDisplay.length > 0) {
      newName = `${cleanName} ${tagSuffix}`.substring(0, 32).trim();
    }

    if (newName !== currentName) {
      await member.setNickname(newName, 'Sincronização automática de apelido com conquistas do banco');
      console.log(`🔄 [SYNC NICKNAME] Nickname de ${username} sincronizado para: ${newName}`);
      // Atualiza o banco de dados para refletir o novo apelido com as tags
      await updateDatabaseUsername(userId, newName);
    }
  } catch (err) {
    console.error(`❌ Erro ao sincronizar nickname de ${username}:`, err.message);
  }
}
