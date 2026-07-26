import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import ffmpegPath from 'ffmpeg-static';

/**
 * Convert browser MediaRecorder audio (usually audio/webm) into WhatsApp-compatible
 * audio/ogg (Opus). Falls back to MP3 if OGG encoding fails.
 */
export async function convertAudioForWhatsApp(
  inputBuffer: Buffer,
  inputMimeType: string
): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  if (!ffmpegPath) {
    throw new Error('ffmpeg is not available. Cannot convert voice note for WhatsApp.');
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-audio-'));
  const extGuess = inputMimeType.includes('ogg')
    ? 'ogg'
    : inputMimeType.includes('mp4')
      ? 'm4a'
      : inputMimeType.includes('mpeg') || inputMimeType.includes('mp3')
        ? 'mp3'
        : 'webm';
  const inputPath = path.join(tmpDir, `input.${extGuess}`);
  await fs.writeFile(inputPath, inputBuffer);

  try {
    // Prefer OGG/Opus — WhatsApp's native voice-note format.
    const oggPath = path.join(tmpDir, 'output.ogg');
    try {
      await runFfmpeg([
        '-y',
        '-i',
        inputPath,
        '-vn',
        '-c:a',
        'libopus',
        '-b:a',
        '32k',
        '-ac',
        '1',
        oggPath,
      ]);
      const buffer = await fs.readFile(oggPath);
      return { buffer, mimeType: 'audio/ogg', fileName: `voice-${Date.now()}.ogg` };
    } catch (oggError) {
      console.warn('OGG conversion failed, trying MP3:', oggError);
    }

    const mp3Path = path.join(tmpDir, 'output.mp3');
    await runFfmpeg([
      '-y',
      '-i',
      inputPath,
      '-vn',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '64k',
      '-ac',
      '1',
      mp3Path,
    ]);
    const buffer = await fs.readFile(mp3Path);
    return { buffer, mimeType: 'audio/mpeg', fileName: `voice-${Date.now()}.mp3` };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('ffmpeg binary missing'));
      return;
    }
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    });
  });
}
