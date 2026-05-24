// ============================================
// speech.js — Utilitário de fala (TTS) para o bot
// ============================================
// Usa a API de TTS do Google Translate para fazer o bot falar
// nos canais de voz de forma prática e 100% gratuita.

import https from 'https';
import ffmpeg from 'ffmpeg-static';
import { createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } from '@discordjs/voice';
import { getRandomQuote } from '../database.js';
import fs from 'fs';
import path from 'path';

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

const recordingsDir = path.resolve('recordings');
const metadataPath = path.resolve('recordings/metadata.json');

/**
 * Lê todas as gravações de voz reais disponíveis.
 * @returns {Array<{userId: string, filePath: string, username: string}>}
 */
export function getRecordedVoices() {
  try {
    if (!fs.existsSync(recordingsDir) || !fs.existsSync(metadataPath)) return [];
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) || {};
    const files = fs.readdirSync(recordingsDir).filter(file => file.endsWith('.pcm'));
    
    return files.map(file => {
      const userId = file.replace('.pcm', '');
      return {
        userId,
        filePath: path.join(recordingsDir, file),
        username: metadata[userId]?.username || 'Membro Desconhecido'
      };
    });
  } catch (err) {
    console.error('⚠️ [SPEECH] Erro ao ler vozes gravadas:', err.message);
    return [];
  }
}

/**
 * Toca o clone de voz gravada real de um usuário.
 * @param {import('@discordjs/voice').VoiceConnection} connection 
 * @param {string} filePath 
 */
export function playRecordedVoice(connection, filePath) {
  if (!connection) return null;

  try {
    const player = createAudioPlayer();
    // StreamType.Raw é PCM de 16 bits, 48kHz, Little Endian, Stereo (decodificado do Opus)
    const resource = createAudioResource(fs.createReadStream(filePath), {
      inputType: StreamType.Raw,
      inlineVolume: true
    });

    resource.volume?.setVolume(0.85);
    player.play(resource);
    connection.subscribe(player);

    player.on('error', (error) => {
      console.error('❌ [SPEECH] Erro no player ao tocar voz clonada:', error.message);
    });

    player.on(AudioPlayerStatus.Idle, () => {
      player.stop();
    });

    return player;
  } catch (err) {
    console.error('❌ [SPEECH] Erro ao reproduzir clone de voz:', err.message);
    return null;
  }
}

/**
 * Escolhe uma frase/áudio aleatório para falar no canal de voz.
 * Mistura clone de voz real gravada (40% de chance), citação TTS (30%) e provérbio em latim (30%).
 * @param {import('@discordjs/voice').VoiceConnection} connection - Conexão de voz do bot
 */
export async function speakRandomPhrase(connection) {
  if (!connection) return null;

  const rand = Math.random();

  // 1. 40% de chance de tocar um clone de voz real gravada se houver
  if (rand < 0.40) {
    const voices = getRecordedVoices();
    if (voices.length > 0) {
      const selected = voices[Math.floor(Math.random() * voices.length)];
      console.log(`🗣️ [SPEECH] Reproduzindo clone de voz real de: ${selected.username}`);
      return playRecordedVoice(connection, selected.filePath);
    }
  }

  // 2. 30% de chance de falar uma citação via TTS
  if (rand < 0.70) {
    try {
      const quote = await getRandomQuote();
      if (quote) {
        const phraseText = `Como diria o ${quote.author}: ${quote.phrase}`;
        console.log(`🗣️ [SPEECH] Citando citação via TTS: "${phraseText}"`);
        return speakText(connection, phraseText, 'pt-BR');
      }
    } catch (err) {
      console.error('⚠️ [SPEECH] Falha ao obter citação clonada para TTS:', err.message);
    }
  }

  // 3. Fallback / 30% de chance: Provérbio medonho em latim
  const randomIndex = Math.floor(Math.random() * RANDOM_PHRASES.length);
  const phrase = RANDOM_PHRASES[randomIndex];
  console.log(`🗣️ [SPEECH] Falando frase medonha em latim: "${phrase}"`);
  return speakText(connection, phrase, 'la');
}
