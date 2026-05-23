// ============================================
// speech.js — Utilitário de fala (TTS) para o bot
// ============================================
// Usa a API de TTS do Google Translate para fazer o bot falar
// nos canais de voz de forma prática e 100% gratuita.

import ffmpeg from 'ffmpeg-static';
import { createAudioPlayer, createAudioResource, AudioPlayerStatus } from '@discordjs/voice';

// Define o caminho do ffmpeg para que o @discordjs/voice consiga transcodificar o MP3 do TTS
process.env.FFMPEG_PATH = ffmpeg;

// Lista de frases aleatórias para o bot falar de tempos em tempos
export const RANDOM_PHRASES = [
  "Ei, vocês sabiam que estou contando cada segundo que vocês falam? Não fiquem calados!",
  "Estou sentindo um silêncio constrangedor aqui...",
  "Se falar desse XP na vida real, vocês já seriam magos supremos da oratória.",
  "Olha só quem resolveu abrir o microfone! Que milagre dos céus.",
  "Atenção: A economia do servidor está flutuando. Falem mais para ganhar Voice Coins!",
  "Prossigam com a conversa, estou anotando tudo para o meu relatório confidencial de voz.",
  "Vocês falam bastante, hein? Minha cabeça de silício já está quase fritando.",
  "Alguém aí comeu mosca? Ninguém fala nada há minutos nesse canal.",
  "Lembrete diário: Bebam água e não se esqueçam de respirar entre as frases.",
  "Esse canal de voz está mais calmo do que um deserto no meio da noite.",
  "Estou monitorando esta chamada. Por favor, digam algo interessante para eu registrar.",
  "Falar no microfone melhora a autoconfiança. Ou pelo menos é o que dizem por aí.",
  "Silêncio no recinto! O bot de voz mais famoso do Discord quer falar!"
];

/**
 * Fala um texto em um canal de voz usando Google TTS.
 * @param {import('@discordjs/voice').VoiceConnection} connection - Conexão de voz do bot
 * @param {string} text - Texto para falar (máx 200 caracteres)
 */
export function speakText(connection, text) {
  if (!connection) {
    console.warn('⚠️ [SPEECH] Tentativa de falar sem conexão de voz ativa.');
    return null;
  }

  try {
    const player = createAudioPlayer();
    // Limite da API pública do Google TTS é de 200 caracteres
    const truncatedText = text.substring(0, 200);
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=pt-BR&client=tw-ob&q=${encodeURIComponent(truncatedText)}`;
    
    // Cria o recurso de áudio com ffmpeg
    const resource = createAudioResource(ttsUrl, {
      inlineVolume: true
    });
    
    // Define um volume agradável (0.75) para não sobressair excessivamente
    resource.volume?.setVolume(0.75);

    player.play(resource);
    connection.subscribe(player);

    player.on('error', (error) => {
      console.error('❌ [SPEECH] Erro no player de áudio:', error.message);
    });

    player.on(AudioPlayerStatus.Idle, () => {
      player.stop();
    });

    return player;
  } catch (err) {
    console.error('❌ [SPEECH] Erro ao reproduzir fala:', err.message);
    return null;
  }
}

/**
 * Escolhe uma frase aleatória e fala no canal.
 * @param {import('@discordjs/voice').VoiceConnection} connection - Conexão de voz do bot
 */
export function speakRandomPhrase(connection) {
  if (!connection) return null;
  const randomIndex = Math.floor(Math.random() * RANDOM_PHRASES.length);
  const phrase = RANDOM_PHRASES[randomIndex];
  console.log(`🗣️ [SPEECH] Falando frase aleatória: "${phrase}"`);
  return speakText(connection, phrase);
}
