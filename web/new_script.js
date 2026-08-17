  let selfReadPaused = false;
  let ocrBusy = false;
  let isCapturing = false;

  const API = 'http://localhost:3777';
  const OCR_MS = 2000;
  const SEND_COOLDOWN = 15000;
  const MIN_NEW = 20;

  let stream = null;
  let ocrTimer = null;
  let clockTimer = null;
  let audioInterval = null;
  let mediaRecorder = null;
  let startT = 0;

  const whisperWorker = new Worker('whisper-worker.js', { type: 'module' });
  whisperWorker.postMessage({ type: 'load' });
  whisperWorker.onmessage = (e) => {
    if (e.data.status === 'ready') {
      const wEl = document.getElementById('s-audio');
      if (wEl) wEl.querySelector('.step-st').textContent = 'Ready (WebGPU: ' + !e.data.fallback + ')';
      if (!e.data.fallback) {
        const el = document.getElementById('s-audio');
        if (el) el.querySelector('.step-label').style.color = 'var(--accent)';
      }
    } else if (e.data.status === 'complete') {
      const text = e.data.text.trim();
      if (text && text.length > 1) {
        addAudioEntry(text);
        audioAllText += ' ' + text;
        pendingAudio += ' ' + text;
        const ac = document.getElementById('audioCharCount');
        if (ac) ac.textContent = audioAllText.length + ' chars';
        maybeAnalyze();
      }
    }
  };

  let ocrReady = false, lastSend = 0;
  let lastImageData = null, lastBbox = null;
  let allText = '';
  let pendingOCR = '';
  let pendingAudio = '';
  let sessionFacts = [];
  let lastText = '';
  let analyzing = false;
  let currentVideoTitle = '';
  let spatialMemory = []; 
  
  let currentCropX = 0, currentCropY = 0;
  let videoStartFrames = [];
  let isVideoLooping = false;
  let activeRequests = 0;
  let videoStartTime = 0;
  let audioAllText = '';

  const $ = id => document.getElementById(id);

  $('btnStart').addEventListener('click', startCapture);
  $('btnStop').addEventListener('click', stopCapture);
  $('floatStop').addEventListener('click', stopCapture);

  fetch(API + '/api/analyze')
    .then(() => { ocrReady = true; setStep('ocr', 'done', 'Ready'); })
    .catch(() => setStep('ocr', 'fail', 'Server offline'));

  let pipWindow = null;

  async function startCapture() {
    try {
      isCapturing = true;
      setStep('capture', 'running', 'Requesting...');
      setStatus('on', 'Requesting...');
      
      const popupOpened = await openFloatingPanel();

      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'never' },
        audio: true, 
        preferCurrentTab: false
      });

      const vid = $('vid');
      vid.srcObject = stream;

      await new Promise((resolve) => {
        vid.onloadedmetadata = () => resolve();
        setTimeout(resolve, 3000);
      });
      vid.play();

      stream.getVideoTracks()[0].addEventListener('ended', stopCapture);

      $('startScreen').style.display = 'none';
      if (!popupOpened) {
        $('activeContent').style.display = 'flex';
        console.log('Floating window blocked, falling back to main tab.');
      }
      $('floatStop').classList.add('show');
      
      startT = Date.now();
      clockTimer = setInterval(updateClock, 1000);
      setStep('capture', 'done', vid.videoWidth + 'x' + vid.videoHeight);
      setStatus('on', 'Monitoring');

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        const audioStream = new MediaStream([audioTrack]);
        mediaRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });
        
        mediaRecorder.ondataavailable = async (e) => {
          if (e.data.size > 0 && isCapturing) {
            const arrayBuffer = await e.data.arrayBuffer();
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            const channelData = audioBuffer.getChannelData(0);
            whisperWorker.postMessage({ type: 'transcribe', audio: channelData });
          }
        };
        
        mediaRecorder.start(8000);
        setStep('audio', 'running', 'Listening');
      } else {
        setStep('audio', 'fail', 'No audio track');
      }

      ocrLoop();
    } catch (e) {
      setStep('capture', 'fail', e.message);
      setStatus('off', 'Idle');
      isCapturing = false;
    }
  }

  async function openFloatingPanel() {
    if ('documentPictureInPicture' in window) {
      try {
        pipWindow = await documentPictureInPicture.requestWindow({ width: 450, height: 700 });
        const style = pipWindow.document.createElement('style');
        style.textContent = document.querySelector('style').textContent;
        pipWindow.document.head.appendChild(style);
        document.querySelectorAll('link[rel="preconnect"], link[href*="fonts"]').forEach(l => {
          pipWindow.document.head.appendChild(l.cloneNode(true));
        });
        pipWindow.document.body.style.cssText = 'font-family:var(--font);background:var(--bg);color:var(--text);margin:0;overflow:hidden;display:flex;flex-direction:column;height:100vh;';
        const content = $('activeContent');
        pipWindow.document.body.appendChild(content);
        content.style.display = 'flex';
        pipWindow.addEventListener('pagehide', () => {
          document.body.insertBefore(content, $('vidWrap'));
          content.style.display = 'none';
          pipWindow = null;
        });
        return true;
      } catch (e) { console.log(e); }
    }

    // Fallback: window.open popup
    const w = 450, h = 700;
    const left = screen.width - w - 30;
    pipWindow = window.open('', 'FactLens', `width=${w},height=${h},left=${left},top=80,resizable=yes`);
    if (pipWindow) {
      pipWindow.document.title = 'FactLens';
      const style = pipWindow.document.createElement('style');
      style.textContent = document.querySelector('style').textContent;
      pipWindow.document.head.appendChild(style);
      document.querySelectorAll('link[rel="preconnect"], link[href*="fonts"]').forEach(l => {
        pipWindow.document.head.appendChild(l.cloneNode(true));
      });
      pipWindow.document.body.style.cssText = 'font-family:var(--font);background:var(--bg);color:var(--text);margin:0;overflow:hidden;display:flex;flex-direction:column;height:100vh;';
      const content = $('activeContent');
      pipWindow.document.body.appendChild(content);
      content.style.display = 'flex';
      pipWindow.addEventListener('beforeunload', () => {
        document.body.insertBefore(content, $('vidWrap'));
        content.style.display = 'none';
        pipWindow = null;
      });
      return true;
    }
    return false;
  }

  function stopCapture() {
    isCapturing = false;
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (ocrTimer) { clearInterval(ocrTimer); ocrTimer = null; }
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    if (audioInterval) { clearInterval(audioInterval); audioInterval = null; }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') { mediaRecorder.stop(); mediaRecorder = null; }

    const content = $('activeContent');
    if (pipWindow) {
      try {
        if (content) document.body.insertBefore(content, $('vidWrap'));
        pipWindow.close();
      } catch(e) {}
      pipWindow = null;
    }

    $('vid').srcObject = null;
    if(content) content.style.display = 'none';
    $('startScreen').style.display = 'flex';
    $('floatStop').classList.remove('show');
    setStatus('off', 'Idle');
    
    // Reset pipeline UI
    ['capture','ocr','audio','preprocess','extract','verify'].forEach(id => {
      setStep(id, 'pending');
    });
    
    lastImageData = null;
    lastBbox = null;
  }

  function updateClock() {
    const d = Math.floor((Date.now() - startT)/1000);
    const m = String(Math.floor(d/60)).padStart(2,'0');
    const s = String(d%60).padStart(2,'0');
    const t = `${m}:${s}`;
    const c = $('timer');
    if (c) c.textContent = t;
  }

  async function runOCR() {
    if (!stream || !ocrReady) return;
    if (activeRequests >= 5) {
      setTimeout(runOCR, 100);
      return;
    }
    
    const vt = stream.getVideoTracks()[0];
    if (!vt || vt.readyState !== 'live') return;

    const vid = $('vid'), cvs = $('cvs'), ctx = cvs.getContext('2d');
    const vw = vid.videoWidth, vh = vid.videoHeight;
    if (!vw || !vh) {
      setStep('ocr', 'running', 'Waiting for video...');
      return;
    }

    const scale = Math.min(1, 1280 / vw);
    cvs.width = Math.round(vw * scale);
    cvs.height = Math.round(vh * scale);
    
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(vid, 0, 0, cvs.width, cvs.height);

    let currentCropX = 0;
    let currentCropY = 0;
    const imageData = ctx.getImageData(0, 0, cvs.width, cvs.height);
    const data = imageData.data;
    let minX = cvs.width, minY = cvs.height, maxX = 0, maxY = 0;
    let changedPixels = 0;

    if (lastImageData) {
      const lastData = lastImageData.data;
      for (let i = 0; i < data.length; i += 16) {
        const diff = Math.abs(data[i] - lastData[i]) + Math.abs(data[i+1] - lastData[i+1]) + Math.abs(data[i+2] - lastData[i+2]);
        if (diff > 45) {
          changedPixels++;
          const idx = i / 4;
          const x = idx % cvs.width;
          const y = Math.floor(idx / cvs.width);
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    lastImageData = imageData;

    let dataUrl = null;
    if (changedPixels < 100 && lastBbox) {
      minX = lastBbox.minX; minY = lastBbox.minY; maxX = lastBbox.maxX; maxY = lastBbox.maxY;
    }

    if (changedPixels >= 100) lastBbox = { minX, minY, maxX, maxY };

    if (lastBbox) {
      const pad = 50;
      let cropX = Math.max(0, lastBbox.minX - pad);
      let cropY = Math.max(0, lastBbox.minY - pad);
      let cropW = Math.min(cvs.width - cropX, (lastBbox.maxX - lastBbox.minX) + pad * 2);
      let cropH = Math.min(cvs.height - cropY, (lastBbox.maxY - lastBbox.minY) + pad * 2);
      
      if (cropW > 150 && cropH > 150) {
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropW; cropCanvas.height = cropH;
        cropCanvas.getContext('2d').putImageData(ctx.getImageData(cropX, cropY, cropW, cropH), 0, 0);
        dataUrl = cropCanvas.toDataURL('image/jpeg', 0.9);
        currentCropX = cropX; currentCropY = cropY;
        
        const hashCvs = document.createElement('canvas');
        hashCvs.width = 16; hashCvs.height = 16;
        hashCvs.getContext('2d').drawImage(cropCanvas, cropCanvas.width*0.1, cropCanvas.height*0.1, cropCanvas.width*0.8, cropCanvas.height*0.8, 0, 0, 16, 16);
        const hData = hashCvs.getContext('2d').getImageData(0,0,16,16).data;
        let sum = 0;
        for(let i=0; i<hData.length; i+=4) sum += (hData[i]+hData[i+1]+hData[i+2])/3;
        const avg = sum / 256;
        let hashStr = '';
        for(let i=0; i<hData.length; i+=4) {
          const gray = (hData[i]+hData[i+1]+hData[i+2])/3;
          hashStr += (gray > avg) ? '1' : '0';
        }
        
        const now = Date.now();
        if (isVideoLooping) {
          setStep('ocr', 'skip', 'Loop Detected');
          setTimeout(runOCR, 200);
          return;
        }

        let isLoop = false;
        if (videoStartTime && (now - videoStartTime > 20000)) {
          for (const startFrame of videoStartFrames) {
            let diff = 0;
            for(let i=0; i<256; i++) { if(startFrame.hash[i] !== hashStr[i]) diff++; }
            if (diff < 10) { isLoop = true; break; }
          }
        }
        
        if (isLoop) {
          isVideoLooping = true;
          addEntry('========== 영상 반복 재생 감지 (Loop) ==========', false);
          setStep('ocr', 'skip', 'Loop Detected');
          setTimeout(runOCR, 200);
          return;
        } else {
          if (videoStartFrames.length < 5) {
            if (videoStartFrames.length === 0 || (now - videoStartFrames[videoStartFrames.length-1].time > 2000)) {
               videoStartFrames.push({ hash: hashStr, time: now });
            }
          }
        }
      } else {
        dataUrl = cvs.toDataURL('image/jpeg', 0.9);
      }
    } else {
      dataUrl = cvs.toDataURL('image/jpeg', 0.9);
    }

    setStep('ocr', 'running', 'Sending to server...');
    activeRequests++;
    setTimeout(runOCR, 200);

    try {
      const res = await fetch(API + '/api/analyze/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl })
      });
      activeRequests--;
      if (!res.ok) throw new Error('API Error');
      const data = await res.json();

      if (data.status === 'ok') {
        if (data.lines && data.lines.length > 0 && data.lines[0].text === lastText) {
          setStep('ocr', 'skip', 'Self-read');
          return;
        }
        
        const rawLines = data.lines || [];
        const newSpatial = [];
        for (const line of rawLines) {
          if (!line.text || line.text.length < 2) continue;
          let matched = false;
          let isStatic = false;
          const absCx = line.cx + currentCropX;
          const absCy = line.cy + currentCropY;

          for (const mem of spatialMemory) {
            if (Math.abs(absCx - mem.cx) < 30 && Math.abs(absCy - mem.cy) < 30) {
              if (jaccard(line.text, mem.text) > 0.4) {
                mem.count++; mem.text = line.text; mem.lastSeen = Date.now();
                isStatic = mem.count > 15;
                newSpatial.push(mem); matched = true; break;
              }
            }
          }
          if (!matched) newSpatial.push({ text: line.text, cx: absCx, cy: absCy, count: 1, lastSeen: Date.now() });
        }
        
        let maxStaticText = '';
        let maxLength = 0;
        for (const mem of newSpatial) {
          if (mem.count > 15 && mem.text.length > 10 && mem.text.length > maxLength) {
            maxLength = mem.text.length;
            maxStaticText = mem.text;
          }
        }

        if (maxStaticText) {
          if (!currentVideoTitle) {
            currentVideoTitle = maxStaticText;
            addEntry(`========== 새 영상 감지: ${maxStaticText} ==========`, false);
            videoStartFrames = [];
            isVideoLooping = false;
            videoStartTime = Date.now();
            updateTitleUI();
          } else {
            if (jaccard(currentVideoTitle, maxStaticText) < 0.5) {
              addEntry(`========== 새 영상 감지: ${maxStaticText} ==========`, false);
              allText = ''; audioAllText = ''; pendingOCR = ''; pendingAudio = '';
              sessionFacts = []; lastText = '';
              const cc = $('charCount'); if(cc) cc.textContent = '0 chars';
              const ac = $('audioCharCount'); if(ac) ac.textContent = '0 chars';
              const af = $('audioFeedBody'); if(af) af.innerHTML = '';
              const rs = $('results'); if(rs) rs.classList.remove('show');
              currentVideoTitle = maxStaticText;
              videoStartFrames = [];
              isVideoLooping = false;
              videoStartTime = Date.now();
              updateTitleUI();
            } else {
              currentVideoTitle = maxStaticText;
              updateTitleUI();
            }
          }
        }

        function updateTitleUI() {
          const container = $('videoTitleContainer');
          if (container) {
            container.innerHTML = `<div style="background: #1e293b; color: #60a5fa; padding: 10px 14px; border-radius: 8px; font-weight: bold; text-align: center; border: 1px solid #334155; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">현재 영상: ${currentVideoTitle.replace(/\n/g, ' ')}</div>`;
          }
        }

        for (const mem of spatialMemory) {
          if (!newSpatial.includes(mem) && Date.now() - mem.lastSeen < 5000) newSpatial.push(mem);
        }
        spatialMemory = newSpatial;

        const freshLines = [];
        for (const mem of newSpatial) {
           if (mem.text.length > 2 && !allText.includes(mem.text)) {
              const tag = mem.count > 15 ? '[고정]' : '[자막]';
              let zone = '[Middle]';
              if (mem.cy < cvs.height * 0.3) zone = '[Top]';
              else if (mem.cy > cvs.height * 0.7) zone = '[Bottom]';
              freshLines.push(`${zone} ${tag} ${mem.text}`);
           }
        }
        
        if (freshLines.length > 0) {
           pendingOCR += freshLines.join('\n') + '\n';
           allText += '\n' + freshLines.join('\n');
           freshLines.forEach(line => addEntry(line, true));
           const cc = $('charCount');
           if (cc) cc.textContent = allText.length + ' chars';
           setStep('ocr', 'done', `${freshLines.length} lines`);
           
           fetch(API + '/api/analyze/quota')
             .then(r => r.json())
             .then(data => {
               const qEl = $('quotaInfo');
               if(qEl) qEl.textContent = `Google API: ${data.usage}/${data.limit}`;
             }).catch(e => {});

           maybeAnalyze();
        } else {
           setStep('ocr', 'done', 'No new text');
        }
      }
    } catch (e) {
      setStep('ocr', 'fail', e.message);
      activeRequests--;
    }
  }

  function ocrLoop() {
    if (!stream || !ocrReady) return;
    runOCR();
  }

  function jaccard(a, b) {
    const s1 = new Set(a), s2 = new Set(b);
    const inter = [...s1].filter(x => s2.has(x)).length;
    const union = new Set([...s1, ...s2]).size;
    return union > 0 ? inter / union : 0;
  }

  function findNew(old, fresh) {
    const oldW = new Set(old.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    return fresh.split(/\s+/).filter(w => !oldW.has(w.toLowerCase()) && w.length > 2).join(' ');
  }

  function maybeAnalyze() {
    if (!isCapturing || analyzing || (pendingOCR.trim().length + pendingAudio.trim().length) < MIN_NEW || (Date.now() - lastSend) < SEND_COOLDOWN) return;
    analyze();
  }

  async function analyze() {
    if (analyzing) return;
    analyzing = true;
    lastSend = Date.now();
    
    const ocrPayload = pendingOCR;
    const audioPayload = pendingAudio;
    pendingOCR = '';
    pendingAudio = '';

    setStep('preprocess', 'running', 'GPT Cleaning...');
    setStatus('on', 'Preprocessing...');

    try {
      const preRes = await fetch(API + '/api/analyze/preprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ocrText: ocrPayload, audioText: audioPayload })
      });
      const preData = await preRes.json();
      
      if (preData.wordLogs?.length) {
        const wLog = $('wordCorrectionLog');
        if (wLog && wLog.textContent === '대기 중...') wLog.textContent = '';
        if (wLog) {
          wLog.textContent += preData.wordLogs.join('\n') + '\n';
          wLog.scrollTop = wLog.scrollHeight;
        }
      }
      if (preData.sentenceLogs?.length) {
        const sLog = $('sentenceFormulationLog');
        if (sLog && sLog.textContent === '대기 중...') sLog.textContent = '';
        if (sLog) {
          sLog.textContent += preData.sentenceLogs.join('\n') + '\n';
          sLog.scrollTop = sLog.scrollHeight;
        }
      }

      setStep('preprocess', 'done', 'Preprocessed');
      
      if (!preData.finalContext?.trim()) {
         setStatus('on', 'Monitoring');
         analyzing = false;
         return;
      }

      setStep('extract', 'running', 'Extracting Facts...');
      setStatus('on', 'Analyzing...');

      const res = await fetch(API + '/api/analyze/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: preData.finalContext })
      });
      const report = await res.json();
      
      if (report.progress?.steps) {
        for (const [k, v] of Object.entries(report.progress.steps)) {
          if (k !== 'preprocess') setStep(k, v.status, v.detail || '');
        }
      }
      
      if (report.partial) setStep(report.failedAt, 'fail', (report.error || '').slice(0, 50));
      if (report.facts?.length > 0) {
        sessionFacts = report.facts;
        renderFacts(report);
      }
      setStatus('on', 'Monitoring');
    } catch (e) {
      setStep('extract', 'fail', e.message);
      setStatus('on', 'Monitoring');
    } finally {
      analyzing = false;
    }
  }

  function renderFacts(report) {
    const el = $('results');
    if(el) el.classList.add('show');
    const fc = $('factCount');
    if(fc) fc.textContent = report.facts.length + ' facts';
    
    const fb = $('factsBody');
    if(fb) {
      fb.innerHTML = report.facts.map((f, i) => {
        const v = f.verification || {};
        const st = (v.status || 'unverified').toLowerCase();
        const srcs = v.sources || [];
        return `<div class="fact fact-${st}" onclick="this.classList.toggle('open')">
          <div class="fact-hdr"><span class="fact-n">${i+1}</span><span class="fact-claim">${esc(f.claim)}</span><span class="fact-arrow">▼</span></div>
          <div class="fact-detail">
            <div style="color:var(--text2);margin-bottom:6px;"><strong style="color:var(--text);">Verdict:</strong> ${esc(v.explanation || 'N/A')}</div>
            ${srcs.map(s => `<div class="src-card">
              <a href="${esc(s.url)}" target="_blank" class="src-link" onclick="event.stopPropagation()">${esc(s.title || s.url)}</a>
              ${s.credibility ? `<span class="cred cred-${s.credibility.level}">${s.credibility.level}</span>` : ''}
            </div>`).join('') || '<div style="color:var(--text3);font-size:11px;">No sources</div>'}
          </div>
        </div>`;
      }).join('');
    }
  }

  function setStep(id, s, detail) {
    const node = $(`s-${id}`);
    if (!node) return;
    node.setAttribute('data-s', s);
    const icon = node.querySelector('.step-icon');
    const st = node.querySelector('.step-st');
    if (s === 'running') icon.innerHTML = '<div class="spinner"></div>';
    else if (s === 'done') icon.textContent = 'OK';
    else if (s === 'fail') icon.textContent = '!';
    else icon.textContent = '-';
    if(st) st.textContent = detail || '';
  }

  function setStatus(type, txt) {
    const d = document.querySelector('.status-dot');
    const l = document.querySelector('.status-text');
    if(d) d.className = 'status-dot ' + type;
    if(l) l.textContent = txt;
  }

  function addEntry(text, isNew) {
    const body = $('feedBody');
    if(!body) return;
    const empty = body.querySelector('.feed-empty');
    if (empty) empty.remove();
    const now = new Date();
    const t = `${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    const div = document.createElement('div');
    div.className = 'entry';
    div.innerHTML = `<span class="t-time">${t}</span>${isNew ? '<span class="t-new">[NEW] </span>' : ''}<span>${esc(text.slice(0,180))}</span>`;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
    while (body.children.length > 40) body.removeChild(body.firstChild);
  }

  function addAudioEntry(text) {
    const body = $('audioFeedBody');
    if(!body) return;
    const now = new Date();
    const t = `${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    const div = document.createElement('div');
    div.className = 'entry';
    div.innerHTML = `<span class="t-time" style="color: #4caf50;">${t}</span><span>${esc(text)}</span>`;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
    while (body.children.length > 40) body.removeChild(body.firstChild);
  }

  function esc(t) { const d = document.createElement('div'); d.textContent = t||''; return d.innerHTML; }
