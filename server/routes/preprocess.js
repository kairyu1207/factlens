const express = require('express');
const router = express.Router();
const { runWordCorrection, runSentenceFormulation, runScriptReconstruction, runEntityResolution, runInformationExtraction } = require('../services/preprocessingPipeline');

router.post('/', async (req, res) => {
  const { ocrText, audioText, existingFacts } = req.body;

  if (!ocrText && !audioText) {
    return res.status(400).json({ error: true, message: 'No text provided' });
  }

  try {
    console.log('\n[Step 1] Word Correction 시작...');
    const correctionResult = await runWordCorrection(ocrText || '', audioText || '');
    
    console.log('[Step 2] Sentence Formulation 시작...');
    const formulationResult = await runSentenceFormulation(correctionResult.correctedOcr, correctionResult.correctedAudio);

    console.log('[Step 3] Script Reconstruction 시작...');
    const reconstructionResult = await runScriptReconstruction(formulationResult.formulationLog);

    console.log('[Step 4] Entity Coreference Resolution 시작...');
    const resolutionResult = await runEntityResolution(reconstructionResult.reconstructedScripts);

    console.log('[Step 5] Information Extraction 시작...');
    const extractionResult = await runInformationExtraction(resolutionResult.resolvedScripts, existingFacts || []);

    res.json({
      success: true,
      wordLogs: [...(correctionResult.ocrLog || []), ...(correctionResult.audioLog || [])],
      sentenceLogs: formulationResult.formulationLog || [],
      reconstructionLogs: reconstructionResult.reconstructionLog || [],
      reconstructedScripts: reconstructionResult.reconstructedScripts || {},
      resolutionLogs: resolutionResult.resolutionLog || [],
      resolvedScripts: resolutionResult.resolvedScripts || {},
      infoLogs: extractionResult || {},
      finalContext: JSON.stringify(resolutionResult.resolvedScripts || {})
    });
  } catch (error) {
    console.error('Preprocessing failed:', error);
    res.status(500).json({ error: true, message: error.message });
  }
});

module.exports = router;
