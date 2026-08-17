const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const { WaveFile } = require('wavefile');

// ffmpeg-static 경로 설정
ffmpeg.setFfmpegPath(ffmpegStatic);

let whisperPipeline = null;

async function initWhisper() {
  if (!whisperPipeline) {
    console.log('[Local AI] Whisper-tiny 모델 로딩 중... (최초 1회 다운로드에 시간이 걸릴 수 있습니다)');
    
    // 환경 설정 (옵션)
    const { env, pipeline } = await import('@xenova/transformers');
    
    whisperPipeline = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small');
    console.log('[Local AI] Whisper 모델 로딩 완료!');
  }
  return whisperPipeline;
}

/**
 * WebM 오디오를 16kHz WAV로 변환 후 Float32 배열로 파싱
 */
function convertAudioToFloat32(audioFilePath) {
  return new Promise((resolve, reject) => {
    const wavPath = audioFilePath + '.wav';
    
    ffmpeg(audioFilePath)
      .outputOptions([
        '-ac 1', // mono
        '-ar 16000', // 16kHz
        '-acodec pcm_s16le' // 16-bit PCM
      ])
      .save(wavPath)
      .on('end', () => {
        try {
          const wavBuffer = fs.readFileSync(wavPath);
          const wav = new WaveFile(wavBuffer);
          
          // Transformers.js가 요구하는 32-bit float 형식으로 변환
          wav.toBitDepth('32f');
          const audioData = wav.getSamples(false, Float32Array);
          
          // 임시 wav 파일 삭제
          fs.unlinkSync(wavPath);
          resolve(audioData);
        } catch (e) {
          reject(e);
        }
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}

/**
 * 로컬 AI(Whisper)를 이용한 오디오 텍스트 변환
 * 
 * @param {string} audioFilePath - 오디오 파일 경로
 * @returns {Promise<string>} 변환된 텍스트
 */
async function transcribeAudio(audioFilePath) {
  try {
    const stats = fs.statSync(audioFilePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    console.log(`[Local AI] 오디오 처리 중: ${path.basename(audioFilePath)} (${fileSizeMB.toFixed(2)}MB)`);

    // 1. 오디오 포맷 변환 및 파싱
    const audioData = await convertAudioToFloat32(audioFilePath);
    
    // 2. 모델 파이프라인 가져오기
    const transcriber = await initWhisper();

    // 3. 음성 인식 실행 (언어 자동 감지 및 환각 방지)
    const result = await transcriber(audioData, {
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5,
      no_repeat_ngram_size: 3
    });

    if (!result || !result.text || result.text.trim().length === 0) {
      throw new Error('음성이 감지되지 않았습니다.');
    }

    return result.text.trim();

  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('오디오 파일을 찾을 수 없습니다.');
    }
    throw new Error(`로컬 Whisper 변환 에러: ${error.message}`);
  }
}

module.exports = { transcribeAudio };
