import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers';

env.allowLocalModels = false;

let transcriber = null;
let isInitializing = false;
let isProcessing = false;
const audioQueue = [];

async function init() {
  if (transcriber || isInitializing) return;
  isInitializing = true;
  self.postMessage({ status: 'loading' });
  
  try {
    // whisper-small로 변경하여 성능/정확도 최우선 (다국어 감지 유지)
    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small', {
      device: 'webgpu',
      dtype: {
        encoder_model: 'fp32',
        decoder_model_merged: 'q4',
      }
    });
    self.postMessage({ status: 'ready' });
  } catch (err) {
    console.error('WebGPU load failed, falling back to WASM', err);
    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small');
    self.postMessage({ status: 'ready', fallback: true });
  }
  isInitializing = false;
}

async function processQueue() {
  if (isProcessing || audioQueue.length === 0 || !transcriber) return;
  isProcessing = true;
  
  const audioData = audioQueue.shift();
  try {
    const output = await transcriber(audioData, {
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5,
      no_repeat_ngram_size: 3,
      return_timestamps: false
    });
    self.postMessage({ status: 'complete', text: output.text });
  } catch (err) {
    self.postMessage({ status: 'error', message: err.message });
  }
  
  isProcessing = false;
  processQueue(); // process next in queue
}

self.onmessage = async (e) => {
  if (e.data.type === 'load') {
    await init();
  } else if (e.data.type === 'transcribe') {
    audioQueue.push(e.data.audio);
    
    if (!transcriber && !isInitializing) {
      await init();
    }
    
    processQueue();
  }
};
