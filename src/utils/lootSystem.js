// ============================================
// utils/lootSystem.js — Motor de Drops e Badges
// ============================================

import { awardBadge, getUserBadges } from '../database.js';

// Cache em memória para garantir que não haja drops repetidos mesmo com delay/erro no Supabase
const pendingAwards = new Set(); // Formato: 'userId:badgeName'


/**
 * Tabela de Drops Dinâmicos (Loot).
 * 'chance' é o percentual base de chance por tentativa (0 a 1).
 * 'condition' avalia se o usuário está elegível naquele momento.
 */
export const LOOT_TABLE = [
  {
    id: 'coruja',
    icon: '🦉',
    name: 'Coruja da Madrugada',
    tag: '[🦉Coruja]',
    chance: 0.15, // 15% de chance
    condition: () => {
      const hora = new Date().getHours();
      return hora >= 2 && hora <= 5; // Entre 2 AM e 5 AM
    }
  },
  {
    id: 'onfire',
    icon: '🔥',
    name: 'Máquina de Falar',
    tag: '[🔥On Fire]',
    chance: 0.05, // 5% de chance
    condition: (speakDurationSeconds) => {
      return speakDurationSeconds > 300; // Falou por mais de 5 minutos direto
    }
  },
  {
    id: 'tagarela',
    icon: '🗣️',
    name: 'Tagarela Inveterado',
    tag: '[🗣️Tagarela]',
    chance: 0.08, 
    condition: (speakDurationSeconds) => {
      return speakDurationSeconds > 120 && speakDurationSeconds <= 300; // Entre 2 e 5 mins diretos
    }
  },
  {
    id: 'sortudo',
    icon: '🎲',
    name: 'Sortudo do Microfone',
    tag: '[🎲Sorte]',
    chance: 0.01, // 1% de chance (muito raro)
    condition: () => true // Pode dropar a qualquer momento que a pessoa pare de falar
  },
  {
    id: 'fantasma',
    icon: '👻',
    name: 'Fantasma Tagarela',
    tag: '[👻Fantasma]',
    chance: 0.03,
    condition: (speakDurationSeconds) => {
      const hora = new Date().getHours();
      return hora === 0; // Dropa à Meia-noite (hora das bruxas)
    }
  },
  {
    id: 'cafe',
    icon: '☕',
    name: 'Bom Dia, Vietnam!',
    tag: '[☕Café]',
    chance: 0.10,
    condition: () => {
      const hora = new Date().getHours();
      return hora >= 6 && hora <= 9; // Drop matinal
    }
  },
  {
    id: 'orador',
    icon: '🎙️',
    name: 'O Grande Orador',
    tag: '[🎙️Orador]',
    chance: 0.20, // Alta chance, pois é difícil atingir
    condition: (speakDurationSeconds) => {
      return speakDurationSeconds >= 600; // Falou por mais de 10 minutos diretos!
    }
  },
  {
    id: 'velocista',
    icon: '⚡',
    name: 'Velocista Vocal',
    tag: '[⚡Velocista]',
    chance: 0.05,
    condition: (speakDurationSeconds) => {
      return speakDurationSeconds >= 5 && speakDurationSeconds <= 8; // Falas muito rápidas, mas válidas
    }
  },
  {
    id: 'sabado',
    icon: '🍻',
    name: 'Inimigo do Fim',
    tag: '[🍻Inimigo]',
    chance: 0.10,
    condition: () => {
      const day = new Date().getDay();
      const hour = new Date().getHours();
      // Dropa sexta à noite ou sábado à noite (após 22h)
      return (day === 5 || day === 6) && (hour >= 22 || hour <= 3);
    }
  }
];

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
    !earnedBadgeIds.includes(loot.name) &&
    !pendingAwards.has(`${userId}:${loot.name}`) // Bloqueio imediato no cache
  );

  if (eligibleLoots.length === 0) return; // Não há loots possíveis ou já tem todos

  // Rolagem de dados (RNG)
  for (const loot of eligibleLoots) {
    const roll = Math.random(); // Gera número entre 0 e 1
    
    // Se a rolagem for menor ou igual à chance (ex: 0.04 <= 0.05) -> VENCEU!
    if (roll <= loot.chance) {
      console.log(`🎁 [LOOT DROP] ${username} ganhou a conquista: ${loot.name}`);
      
      // Trava no cache local IMEDIATAMENTE para garantir anti-duplicação absoluta
      pendingAwards.add(`${userId}:${loot.name}`);

      // Salva no banco de dados
      await awardBadge(userId, username, loot.icon, loot.name, loot.tag);

      // Dispara a recompensa visual no Discord
      await announceLootDrop(client, guildId, channelId, userId, loot);
      
      // Garante que só ganhe 1 loot por avaliação
      break; 
    }
  }
}

/**
 * Anuncia no servidor e muda o apelido temporariamente (ou adiciona a tag).
 */
async function announceLootDrop(client, guildId, channelId, userId, loot) {
  try {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) return;

    // Buscar o membro para mudar o apelido
    const member = await guild.members.fetch(userId);
    
    // Enviar mensagem no chat de texto vinculado ao canal de voz (se possível)
    const channel = await guild.channels.fetch(channelId);
    if (channel && channel.isTextBased()) { // A partir de certas atualizações, canais de voz têm chat de texto associado
      await channel.send({
        content: `🎉 **DROP ÉPICO!** ${member.user} acaba de desbloquear uma nova conquista secreta: **${loot.icon} ${loot.name}**!\nUma tag especial \`${loot.tag}\` foi adicionada ao seu perfil!`
      });
    } else {
      // Se não conseguir mandar no chat do canal de voz, pode mandar no canal do sistema (systemChannel)
      if (guild.systemChannel) {
        await guild.systemChannel.send({
          content: `🎉 **DROP DE VOZ!** ${member.user} desbloqueou a conquista secreta: **${loot.icon} ${loot.name}** lá no canal de voz!`
        });
      }
    }

    // Mudar o nickname (adicionar a tag)
    // OBS: O bot precisa ter permissão de Gerenciar Apelidos e estar ACIMA do usuário na hierarquia de cargos
    if (member.manageable) {
      const currentName = member.displayName;
      // Evita duplicar tags
      if (!currentName.includes(loot.tag)) {
        // Limite do Discord é 32 caracteres para nicknames
        const newName = `${loot.tag} ${currentName}`.substring(0, 32);
        await member.setNickname(newName, `Conquista desbloqueada: ${loot.name}`);

        // Agenda a remoção da tag após 24 horas
        setTimeout(() => {
          member.guild.members.fetch(userId).then(m => {
            if (m && m.manageable && m.displayName.includes(loot.tag)) {
              // Limpa a tag do nome
              const revertedName = m.displayName.replace(`${loot.tag} `, '').replace(loot.tag, '');
              m.setNickname(revertedName.substring(0, 32), 'Expirou o tempo de 24h da tag de conquista');
            }
          }).catch(() => {});
        }, 24 * 60 * 60 * 1000); // 24 horas em milissegundos
      }
    }

    // Tocar o efeito sonoro no Soundboard do Discord (API V14)
    // Usando endpoint REST direto para garantir compatibilidade com qualquer sub-versão do V14
    try {
      await client.rest.post(`/channels/${channelId}/send-soundboard-sound`, {
        body: { sound_id: '1480429947125497866' }
      });
    } catch (soundError) {
      console.error('❌ Erro ao tocar som do Soundboard:', soundError.message);
    }

  } catch (error) {
    console.error('❌ Erro ao processar recompensa visual do loot:', error.message);
  }
}
