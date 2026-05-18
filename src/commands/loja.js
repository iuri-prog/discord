// ============================================
// commands/loja.js — A Loja do Caos
// ============================================

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getEconomy, spendCoins, addEconomy } from '../database.js';

export const data = new SlashCommandBuilder()
  .setName('loja')
  .setDescription('Loja do Caos: Compre itens para zoar seus amigos na call de voz.')
  .addSubcommand(subcommand =>
    subcommand
      .setName('mordaca')
      .setDescription('🤐 (100 coins) Muta um amigo no servidor por 10 segundos.')
      .addUserOption(option => option.setName('alvo').setDescription('Quem você quer mutar').setRequired(true))
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('surdez')
      .setDescription('🔇 (150 coins) Deixa um amigo totalmente surdo no Discord por 15 segundos.')
      .addUserOption(option => option.setName('alvo').setDescription('Quem vai ficar surdo').setRequired(true))
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('chute')
      .setDescription('👢 (400 coins) Derruba um amigo da call atual.')
      .addUserOption(option => option.setName('alvo').setDescription('Quem você quer chutar').setRequired(true))
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('teleporte')
      .setDescription('🌀 (300 coins) Joga um amigo para um canal de voz aleatório.')
      .addUserOption(option => option.setName('alvo').setDescription('Quem vai ser teleportado').setRequired(true))
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('identidade')
      .setDescription('🤡 (200 coins) Troca o apelido do amigo por uma piada aleatória por 10 minutos.')
      .addUserOption(option => option.setName('alvo').setDescription('Vítima do apelido').setRequired(true))
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('trombadinha')
      .setDescription('🥷 (50 coins) Tenta roubar moedas de um amigo. 50% de chance de sucesso.')
      .addUserOption(option => option.setName('alvo').setDescription('A vítima do roubo').setRequired(true))
  );

// Nomes zoados para a troca de identidade
const TROLL_NAMES = [
  "Microfone de R$10",
  "O Caladão",
  "Gado Demais",
  "Rei do Cringe",
  "Fã de Kpop",
  "Zé da Manga",
  "Sem Microfone",
  "Mamãe mandou dormir",
  "Caçador de Borboletas"
];

export async function execute(interaction) {
  await interaction.deferReply();

  const command = interaction.options.getSubcommand();
  const targetUser = interaction.options.getUser('alvo');
  const executor = interaction.user;

  if (targetUser.id === executor.id) {
    return interaction.editReply('Você não pode usar itens em si mesmo, gênio.');
  }
  if (targetUser.bot) {
    return interaction.editReply('Meus irmãos robôs são imunes aos itens humanos.');
  }

  // Tenta buscar o alvo na Guilda para ver se ele está numa call
  const guild = interaction.guild;
  const memberTarget = await guild.members.fetch(targetUser.id).catch(() => null);

  if (!memberTarget) {
    return interaction.editReply('Usuário não encontrado no servidor.');
  }

  // Ações da Loja
  let price = 0;
  
  if (command === 'mordaca') price = 100;
  if (command === 'surdez') price = 150;
  if (command === 'chute') price = 400;
  if (command === 'teleporte') price = 300;
  if (command === 'identidade') price = 200;
  if (command === 'trombadinha') price = 50;

  // Verifica Saldo
  const econ = await getEconomy(executor.id);
  if (econ.voice_coins < price) {
    return interaction.editReply(`❌ Você está pobre! Precisa de \`${price}\` moedas, mas só tem \`${econ.voice_coins}\`. Fale mais nas calls para ganhar dinheiro.`);
  }

  // Checagens prévias de conexão (exceto pra roubo e identidade)
  if (['mordaca', 'surdez', 'chute', 'teleporte'].includes(command)) {
    if (!memberTarget.voice || !memberTarget.voice.channel) {
      return interaction.editReply(`❌ O alvo ${targetUser} não está em nenhum canal de voz! O item só funciona se ele estiver numa call.`);
    }
  }

  // Desconta o dinheiro
  const success = await spendCoins(executor.id, price);
  if (!success) {
    return interaction.editReply('❌ Erro ao descontar suas moedas.');
  }

  // EXECUÇÃO DO ITEM
  try {
    if (command === 'mordaca') {
      await memberTarget.voice.setMute(true, `Vítima de mordaça por ${executor.username}`);
      interaction.editReply(`🤐 **MORDAÇA!** Você pagou ${price} moedas e ${targetUser} ficará calado(a) por 10 segundos!`);
      
      setTimeout(async () => {
        try { await memberTarget.voice.setMute(false, 'Tempo da mordaça acabou'); } catch (e) {}
      }, 10000);
    }

    else if (command === 'surdez') {
      await memberTarget.voice.setDeaf(true, `Vítima de surdez por ${executor.username}`);
      interaction.editReply(`🔇 **SURDEZ SÚBITA!** Você pagou ${price} moedas. ${targetUser} ficou totalmente surdo(a) na call por 15 segundos! Shhh... fofoquem dele!`);
      
      setTimeout(async () => {
        try { await memberTarget.voice.setDeaf(false, 'Tempo da surdez acabou'); } catch (e) {}
      }, 15000);
    }

    else if (command === 'chute') {
      await memberTarget.voice.disconnect(`Chutado por ${executor.username}`);
      interaction.editReply(`👢 **O CHUTE!** Você pagou ${price} moedas! O pé virtual atingiu a bunda de ${targetUser} e ele(a) voou do canal de voz! 😂`);
    }

    else if (command === 'teleporte') {
      // Pega canais de voz exceto o atual
      const voiceChannels = guild.channels.cache.filter(c => 
        (c.type === 2 || c.type === 13) && c.id !== memberTarget.voice.channelId
      );
      
      if (voiceChannels.size === 0) {
        // Se não tiver pra onde mover, devolve as moedas
        await addEconomy(executor.id, executor.username, price, 0);
        return interaction.editReply(`❌ Não há outros canais de voz disponíveis para teletransportar ${targetUser}. Moedas devolvidas.`);
      }

      const randomChannel = voiceChannels.random();
      await memberTarget.voice.setChannel(randomChannel, `Teleportado por ${executor.username}`);
      interaction.editReply(`🌀 **TELEPORTE!** Gastou ${price} moedas! ${targetUser} foi sugado(a) por um vórtice e parou lá no canal **${randomChannel.name}**!`);
    }

    else if (command === 'identidade') {
      if (!memberTarget.manageable) {
        await addEconomy(executor.id, executor.username, price, 0);
        return interaction.editReply(`❌ Não tenho permissão (hierarquia) para mudar o nick de ${targetUser}. Moedas devolvidas.`);
      }

      const oldNick = memberTarget.displayName;
      const newNick = TROLL_NAMES[Math.floor(Math.random() * TROLL_NAMES.length)];
      
      await memberTarget.setNickname(newNick, `Vítima de Identidade por ${executor.username}`);
      interaction.editReply(`🤡 **NOVA IDENTIDADE!** Pagou ${price} moedas! Pelos próximos 10 minutos, o apelido de ${targetUser} será **${newNick}** no servidor!`);
      
      setTimeout(async () => {
        try {
          // Só muda de volta se o nick ainda for o troll
          if (memberTarget.displayName === newNick) {
            await memberTarget.setNickname(oldNick, 'Trollagem acabou');
          }
        } catch (e) {}
      }, 10 * 60 * 1000); // 10 minutos
    }

    else if (command === 'trombadinha') {
      const targetEcon = await getEconomy(targetUser.id);
      
      if (targetEcon.voice_coins < 10) {
        await addEconomy(executor.id, executor.username, price, 0);
        return interaction.editReply(`❌ ${targetUser} está mais liso que você (tem menos de 10 moedas). O roubo não ia compensar. Moedas devolvidas.`);
      }

      // Sorteio (50% chance)
      const isSuccess = Math.random() >= 0.5;

      if (isSuccess) {
        // Quantia a roubar: de 10 a 50 moedas, ou o máximo que ele tiver se for menor
        const rouboAmount = Math.min(targetEcon.voice_coins, Math.floor(Math.random() * 41) + 10);
        
        await spendCoins(targetUser.id, rouboAmount);
        await addEconomy(executor.id, executor.username, rouboAmount, 0); // O preço (50) já foi gasto, ele lucra o roubo

        interaction.editReply(`🥷 **BATEU A CARTEIRA!** Deu bom! Você pagou os 50 da taxa da gangue e conseguiu roubar \`${rouboAmount}\` moedas de ${targetUser}! Seu saldo aumentou.`);
      } else {
        // Falha! Ele já gastou os 50. Agora vamos dar os 50 para a vítima.
        await addEconomy(targetUser.id, targetUser.user.username, price, 0);
        
        interaction.editReply(`🚔 **DEU RUIM!** Você tentou bater a carteira de ${targetUser}, tropeçou e caiu de cara no chão! Você perdeu \`${price}\` moedas, e o alvo pegou elas do chão pra ele!`);
      }
    }

  } catch (error) {
    console.error('❌ Erro na execução de item da loja:', error);
    // Se der erro de permissão no Discord, tenta devolver as moedas
    await addEconomy(executor.id, executor.username, price, 0);
    return interaction.editReply(`❌ Ocorreu um erro ao usar o item em ${targetUser} (Possível falta de permissões do bot). Suas moedas foram devolvidas.`);
  }
}
