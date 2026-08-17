const { YoutubeTranscript } = require('youtube-transcript');

/**
 * Extract transcript/captions from a YouTube video URL.
 * Works with:
 *   - https://youtube.com/watch?v=XXXXX
 *   - https://youtu.be/XXXXX
 *   - https://youtube.com/shorts/XXXXX
 */
async function getYouTubeTranscript(url) {
  try {
    // Extract video ID from URL
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    console.log(`[Transcript] Fetching captions for video: ${videoId}`);

    const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
      lang: 'en'
    });

    if (!transcript || transcript.length === 0) {
      // Try without language preference
      const fallback = await YoutubeTranscript.fetchTranscript(videoId);
      if (!fallback || fallback.length === 0) {
        throw new Error('No captions available for this video');
      }
      return formatTranscript(fallback);
    }

    return formatTranscript(transcript);

  } catch (error) {
    // Try fallback without language
    try {
      const videoId = extractVideoId(url);
      const fallback = await YoutubeTranscript.fetchTranscript(videoId);
      if (fallback && fallback.length > 0) {
        return formatTranscript(fallback);
      }
    } catch (e) {
      // ignore fallback error
    }
    throw new Error(`Transcript fetch failed: ${error.message}`);
  }
}

function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/ // Direct video ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function formatTranscript(segments) {
  const fullText = segments.map(s => s.text).join(' ');
  return {
    text: fullText,
    segments: segments.map(s => ({
      text: s.text,
      start: s.offset / 1000,   // Convert ms to seconds
      duration: s.duration / 1000
    })),
    charCount: fullText.length,
    segmentCount: segments.length
  };
}

module.exports = { getYouTubeTranscript };
