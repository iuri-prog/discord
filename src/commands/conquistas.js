// ============================================
// commands/conquistas.js — Comando /conquistas
// ============================================
// Exibe as estatísticas globais de raridade de todas
// as conquistas do bot, junto com as instruções de obtenção.

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getBadgeRarityStats } from '../database.js';
import { LOOT_TABLE } from '../utils/lootSystem.js';

const BADGE_DESCRIPTIONS = {
  'coruja': 'Falar em canais de voz entre 02:00 e 05:00 da madrugada.',
  'onfire': 'Falar por mais de 5 minutos ininterruptos.',
  'tagarela': 'Falar entre 2 e 5 minutos ininterruptos.',
  'sortudo': 'Drop de chance pura ao sair da call ou parar de falar.',
  'fantasma': 'Falar durante a meia-noite (entre 00:00 e 00:59).',
  'cafe': 'Falar das 06:00 às 09:00 da manhã.',
  'orador': 'Falar por mais de 10 minutos ininterruptos.',
  'velocista': 'Falar de forma super rápida (entre 5 e 8 segundos).',
  'sabado': 'Falar nas noites de sexta ou sábado (entre 22:00 e 03:00).'
};

export const data = new SlashCommandBuilder()
  .setName('conquistas')
  .setDescription('Exibe as estatísticas de raridade das conquistas e como ganhar cada uma.');

export async function execute(interaction) {
  await interaction.deferReply();

  try {
    const rarityStats = await getBadgeRarityStats();
    
    // Calcula o total acumulado de todos os drops no servidor
    const totalDrops = Object.values(rarityStats).reduce((sum, val) => sum + val, 0) || 1;

    const embed = new EmbedBuilder()
      .setColor(0x8B5CF6) // Roxo Violeta
      .setTitle('🏆 Guia de Conquistas e Raridade (Loot Drops)')
      .setDescription(
        'Aqui estão todas as conquistas secretas que você pode dropar enquanto fala nos canais de voz, ' +
        'as regras de evolução de apelido e a frequência global delas no servidor.'
      )
      .setTimestamp();

    // Adiciona cada conquista como um field do Embed
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
      text: `Total de conquistas concedidas no servidor: ${totalDrops} · Solicitado por ${interaction.user.username}`,
      iconURL: interaction.user.displayAvatarURL({ size: 32 })
    });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Erro ao executar /conquistas:', error);
    await interaction.editReply('❌ Ocorreu um erro ao carregar as estatísticas das conquistas.');
  }
}
