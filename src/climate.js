// ============================================
// climate.js — Motor de Clima Dinâmico e Eventos Globais
// ============================================
import { EmbedBuilder } from 'discord.js';

// Estado global do clima
export const climateState = {
  currentEvent: null, // 'XP_STORM', 'COIN_RUSH', ou null
  endTime: null,
};

const EVENTS = {
  XP_STORM: {
    id: 'XP_STORM',
    name: '🌩️ Tempestade de XP',
    description: 'O tempo de fala vale o TRIPLO de bônus de XP!',
    durationMs: 30 * 60 * 1000, // 30 minutos
    color: 0x3b82f6 // Azul
  },
  COIN_RUSH: {
    id: 'COIN_RUSH',
    name: '💰 Febre do Ouro',
    description: 'Você ganha o DOBRO de Voice Coins ao falar!',
    durationMs: 30 * 60 * 1000,
    color: 0xf59e0b // Amarelo/Dourado
  }
};

/**
 * Inicia o motor de clima.
 * @param {import('discord.js').Client} client 
 */
export function startClimateEngine(client) {
  // Roda a cada hora (3600000 ms) para checar o clima
  // Para testes, vamos rodar a cada 5 minutos (300000 ms) se preferir, 
  // mas em produção 1 hora é o ideal.
  setInterval(() => {
    rollForEvent(client);
  }, 3600000);
  
  // Rola assim que ligar pra ver se tem sorte
  setTimeout(() => rollForEvent(client), 10000);
}

function rollForEvent(client) {
  // Só rola se não houver evento ativo
  if (climateState.currentEvent) {
    if (Date.now() >= climateState.endTime) {
      endEvent(client);
    }
    return;
  }

  // 15% de chance de iniciar um evento
  const roll = Math.random();
  if (roll <= 0.15) {
    const eventKeys = Object.keys(EVENTS);
    const randomEvent = EVENTS[eventKeys[Math.floor(Math.random() * eventKeys.length)]];
    triggerEvent(client, randomEvent);
  }
}

function triggerEvent(client, event) {
  climateState.currentEvent = event.id;
  climateState.endTime = Date.now() + event.durationMs;

  console.log(`🌍 [CLIMA] Evento Global Iniciado: ${event.name}`);

  // Anuncia em todos os servidores
  client.guilds.cache.forEach(async (guild) => {
    const channel = guild.systemChannel || guild.channels.cache.find(c => c.isTextBased() && c.permissionsFor(guild.members.me).has('SendMessages'));
    if (channel) {
      const embed = new EmbedBuilder()
        .setColor(event.color)
        .setTitle(`🌍 Evento Global: ${event.name}`)
        .setDescription(`${event.description}\nCorram para as chamadas de voz! O evento dura apenas 30 minutos.`)
        .setFooter({ text: 'Aproveite enquanto dura!' })
        .setTimestamp();
      
      try {
        await channel.send({ embeds: [embed] });
      } catch (err) {
        // Ignora erro de permissão
      }
    }
  });

  // Agenda o fim do evento
  setTimeout(() => {
    endEvent(client);
  }, event.durationMs);
}

function endEvent(client) {
  if (!climateState.currentEvent) return;

  const event = EVENTS[climateState.currentEvent];
  climateState.currentEvent = null;
  climateState.endTime = null;

  console.log(`🌍 [CLIMA] Evento Global Finalizado: ${event.name}`);

  // Anuncia fim
  client.guilds.cache.forEach(async (guild) => {
    const channel = guild.systemChannel || guild.channels.cache.find(c => c.isTextBased() && c.permissionsFor(guild.members.me).has('SendMessages'));
    if (channel) {
      try {
        await channel.send(`☁️ O evento **${event.name}** acabou. O clima voltou ao normal.`);
      } catch (err) {}
    }
  });
}
