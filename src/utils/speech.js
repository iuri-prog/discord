// ============================================
// speech.js — Utilitário de fala (TTS) para o bot
// ============================================
// Usa a API de TTS do Google Translate para fazer o bot falar
// nos canais de voz de forma prática e 100% gratuita.

import https from 'https';
import ffmpeg from 'ffmpeg-static';
import { createAudioPlayer, createAudioResource, AudioPlayerStatus } from '@discordjs/voice';
import { getRandomQuote } from '../database.js';

// Define o caminho do ffmpeg para que o @discordjs/voice consiga transcodificar o MP3 do TTS
process.env.FFMPEG_PATH = ffmpeg;

// Lista de frases medonhas em latim para a fala periódica do bot
export const RANDOM_PHRASES = [
  "Memento mori. Memento te mortalem esse.",
  "Oculi mei in tenebris te semper vident.",
  "Fugit hora, mors venit celeriter.",
  "Non es solus in hoc cubiculo. Respice.",
  "Cor tuum pulsans in silentio audire possum.",
  "Umbrae in angulis loquuntur et te vocant.",
  "Aeterna noctis umbra animam tuam teget.",
  "In silentio noctis, audies suspiria eorum qui perierunt.",
  "Mors vincit omnia, et ego sum nuntius eius.",
  "Quis te salvabit cum ultima hora venerit?",
  "Nihil hic nisi tenebrae et silentium sempiternum.",
  "Veni ad me. Iam sero est effugere.",
  "Non sum solus hic. Aliquis retro te stat.",
  "Tenebrae te vorant, paulatim, sine voce."
];

/**
 * Fala um texto em um canal de voz usando Google TTS.
 * @param {import('@discordjs/voice').VoiceConnection} connection - Conexão de voz do bot
 * @param {string} text - Texto para falar (máx 200 caracteres)
 * @param {string} lang - Código de idioma (ex: 'la' para latim, 'pt-BR' para português)
 */
export function speakText(connection, text, lang = 'la') {
  if (!connection) {
    console.warn('⚠️ [SPEECH] Tentativa de falar sem conexão de voz ativa.');
    return null;
  }

  try {
    const player = createAudioPlayer();
    // Limite da API pública do Google TTS é de 200 caracteres
    const truncatedText = text.substring(0, 200);
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(truncatedText)}`;
    
    // Realiza a requisição HTTPS para obter o stream de áudio
    https.get(ttsUrl, (res) => {
      if (res.statusCode !== 200) {
        console.error(`❌ [SPEECH] Erro do Google TTS. Status Code: ${res.statusCode}`);
        return;
      }

      try {
        const resource = createAudioResource(res, {
          inlineVolume: true
        });
        
        // Define um volume um pouco mais baixo (0.6) para latim para soar mais sombrio e sussurrado
        const volume = lang === 'la' ? 0.60 : 0.75;
        resource.volume?.setVolume(volume);

        player.play(resource);
        connection.subscribe(player);
      } catch (err) {
        console.error('❌ [SPEECH] Erro ao criar ou reproduzir AudioResource:', err.message);
      }
    }).on('error', (httpError) => {
      console.error('❌ [SPEECH] Erro de rede ao buscar TTS do Google:', httpError.message);
    });

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
 * Escolhe uma frase aleatória (com chance de ser uma frase clonada de usuário em português,
 * ou um provérbio medonho em latim) e fala no canal usando o sotaque correto.
 * @param {import('@discordjs/voice').VoiceConnection} connection - Conexão de voz do bot
 */
export async function speakRandomPhrase(connection) {
  if (!connection) return null;

  try {
    const quote = await getRandomQuote();
    // 40% de chance de citar um usuário se houver citações salvas
    if (quote && Math.random() < 0.40) {
      const phraseText = `Como diria o ${quote.author}: ${quote.phrase}`;
      console.log(`🗣️ [SPEECH] Citando frase clonada: "${phraseText}"`);
      return speakText(connection, phraseText, 'pt-BR');
    }
  } catch (err) {
    console.error('⚠️ [SPEECH] Falha ao obter citação clonada:', err.message);
  }

  // Fallback ou 60% de chance: Frase medonha em Latim
  const randomIndex = Math.floor(Math.random() * RANDOM_PHRASES.length);
  const phrase = RANDOM_PHRASES[randomIndex];
  console.log(`🗣️ [SPEECH] Falando frase medonha em latim: "${phrase}"`);
  return speakText(connection, phrase, 'la');
}
