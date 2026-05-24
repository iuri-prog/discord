// ============================================
// utils/lootSystem.js — Motor de Drops e Badges
// ============================================

import { awardBadge, getUserBadges, addSpeakingTime } from '../database.js';
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
      { threshold: 5, icon: '🦅', name: 'Coruja Caçadora', tag: '🦅' },
      { threshold: 10, icon: '👑🦉', name: 'Imperador da Madrugada', tag: '👑🦉' }
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
      { threshold: 5, icon: '💥', name: 'Supernova Vocal', tag: '💥' },
      { threshold: 10, icon: '☄️', name: 'Meteoro de Falas', tag: '☄️' }
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
      { threshold: 5, icon: '📢', name: 'Tagarela de Elite', tag: '📢' },
      { threshold: 10, icon: '📣', name: 'Propagador do Caos', tag: '📣' }
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
      { threshold: 10, icon: '✨', name: 'Abençoado pelo RNG', tag: '✨' }
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
      { threshold: 5, icon: '💀', name: 'Espectro Falante', tag: '💀' },
      { threshold: 10, icon: '👿', name: 'Demônio da Voz', tag: '👿' }
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
      { threshold: 5, icon: '🥞', name: 'Café Completo', tag: '🥞' },
      { threshold: 10, icon: '☀️', name: 'Despertar do Sol', tag: '☀️' }
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
      { threshold: 5, icon: '🎭', name: 'Monologuista Teatral', tag: '🎭' },
      { threshold: 10, icon: '🏛️', name: 'Filósofo de Atenas', tag: '🏛️' }
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
      { threshold: 10, icon: '🚀', name: 'Foguete Sonoro', tag: '🚀' }
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
      { threshold: 5, icon: '🥂', name: 'Celebrante da Madrugada', tag: '🥂' },
      { threshold: 10, icon: '🍷', name: 'Sommelier Noturno', tag: '🍷' }
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

    // Apaga a mensagem automaticamente após 10 segundos (10000ms) para não acumular spam nos chats
    if (sentMessage) {
      setTimeout(() => {
        sentMessage.delete().catch(err => {
          console.warn(`[LOOT SYSTEM] Não foi possível deletar a mensagem de drop/conquista: ${err.message}`);
        });
      }, 10000);
    }

    // Mudar o nickname (adicionar a tag)
    // OBS: O bot precisa ter permissão de Gerenciar Apelidos e estar ACIMA do usuário na hierarquia de cargos
    if (member.manageable) {
      const currentName = member.displayName;
      
      // Coleta todas as tags possíveis dessa conquista (base e evoluções) para remover qualquer tag anterior
      const allTags = [loot.tag, ...(loot.evolutions || []).map(ev => ev.tag)];
      let cleanName = currentName;
      for (const t of allTags) {
        cleanName = cleanName.replace(` ${t}`, '').replace(t, '');
      }
      cleanName = cleanName.trim();

      // Limite do Discord é 32 caracteres para nicknames (sufixo agora)
      const newName = `${cleanName} ${currentBadge.tag}`.trim().substring(0, 32);
      await member.setNickname(newName, `Conquista desbloqueada/evoluída: ${currentBadge.name}`);

      // Agenda a remoção da tag ativa após 24 horas
      setTimeout(() => {
        member.guild.members.fetch(userId).then(m => {
          if (m && m.manageable && m.displayName.includes(currentBadge.tag)) {
            // Limpa a tag ativa do nome
            const revertedName = m.displayName.replace(` ${currentBadge.tag}`, '').replace(currentBadge.tag, '').trim();
            m.setNickname(revertedName.substring(0, 32), 'Expirou o tempo de 24h da tag de conquista');
          }
        }).catch(() => {});
      }, 24 * 60 * 60 * 1000); // 24 horas em milissegundos
    }

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
 * garantindo que possua os ícones corretos de evolução se algum ícone da conquista estiver presente.
 * @param {import('discord.js').GuildMember} member 
 */
export async function syncMemberNicknameBadges(member) {
  if (!member || !member.manageable) return;

  try {
    const userId = member.id;
    const existingBadges = await getUserBadges(userId);
    if (!existingBadges || existingBadges.length === 0) return;

    // Conta conquistas por nome base
    const badgeCounts = {};
    existingBadges.forEach(b => {
      badgeCounts[b.badge_name] = (badgeCounts[b.badge_name] || 0) + 1;
    });

    let currentName = member.displayName;
    let newName = currentName;
    let nameChanged = false;

    for (const loot of LOOT_TABLE) {
      const count = badgeCounts[loot.name] || 0;
      if (count === 0) continue;

      const currentBadge = getCurrentBadgeInfo(loot, count);
      const allTags = [loot.tag, ...(loot.evolutions || []).map(ev => ev.tag)];

      // Checa se o apelido atual contém alguma das tags desta conquista
      const activeTagInNickname = allTags.find(tag => currentName.includes(tag));

      if (activeTagInNickname) {
        // Se a tag no apelido for diferente da tag correta da evolução atual
        if (activeTagInNickname !== currentBadge.tag) {
          // Limpa todas as tags antigas desse grupo
          for (const t of allTags) {
            newName = newName.replace(` ${t}`, '').replace(t, '');
          }
          newName = newName.trim();
          // Insere a tag correta
          newName = `${newName} ${currentBadge.tag}`.trim().substring(0, 32);
          nameChanged = true;
        }
      }
    }

    if (nameChanged && newName !== currentName) {
      await member.setNickname(newName, 'Sincronização automática de tags de conquista');
      console.log(`🔄 [SYNC NICKNAME] Nickname de ${member.user.username} sincronizado para: ${newName}`);
    }
  } catch (err) {
    console.error(`❌ Erro ao sincronizar nickname de ${member?.user?.username || member?.id}:`, err.message);
  }
}
