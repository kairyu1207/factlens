async function test() {
  const { pipeline, env } = await import('@xenova/transformers');
  console.log('Available providers:', env.backends.onnx.node.executionProviders);
  // Try adding DML
  env.backends.onnx.node.executionProviders = ['dmlExecutionProvider', 'cpuExecutionProvider'];
  console.log('Set to:', env.backends.onnx.node.executionProviders);
  try {
    const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny');
    console.log('Successfully loaded model with DML/CPU!');
  } catch (e) {
    console.error('Error loading with GPU:', e);
  }
}
test();
