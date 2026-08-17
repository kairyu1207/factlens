
let selfReadPaused = false;
let ocrBusy = false;

    const API = 'http://localhost:3777';
    const OCR_MS = 2000;  // 2s for faster tracking
    const SEND_COOLDOWN = 30000;
    const MIN_NEW = 50;

    let stream = null, ocrTimer = null, clockTimer = null, startT = 0;
    let ocrReady = false, lastSend = 0;
    let lastImageData = null, lastBbox = null;
    let frameHistory = []; 
    let allText = '';
    let lastText = '';
    let pending = '';
    let sessionFacts = [];
    let currentVideoTitle = '';
    let spatialMemory = []; // Tracks word positions and lifespan
    
    // Video Start Tracking for robust loop detection
    let videoStartTime = Date.now();
    let videoStartFrames = [];

    const $ = id => {
      const el = document.getElementById(id);
      if (el) return el;
      // Also search PiP window if content was moved there
      if (pipWindow && !pipWindow.closed) {
        try { return pipWindow.document.getElementById(id); } catch(e) {}
      }
      return null;
    };

    $('btnStart').addEventListener('click', startCapture);
    $('btnStop').addEventListener('click', stopCapture);
    $('floatStop').addEventListener('click', stopCapture);

    // Self-read detection keywords (our own UI)
    const SELF_KEYWORDS = ['factlens', 'screen monitor', 'pipeline status', 'live ocr text', 'start capture', 'source verification'];

    let pipWindow = null;

    async function startCapture() {
      try {
        setStep('capture', 'running', 'Requesting...');
        setStatus('on', 'Requesting...');

        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'never' },
          audio: true, // enable audio capture for Whisper
          preferCurrentTab: false
        });

        const vid = $('vid');
        vid.srcObject = stream;

        // Wait for video to load metadata (dimensions)
        await new Promise((resolve) => {
          vid.onloadedmetadata = () => resolve();
          setTimeout(resolve, 3000);
        });
        await vid.play();

        $('startScreen').style.display = 'none';
        $('activeContent').style.display = 'flex';
        $('floatStop').classList.add('show');

        setStep('capture', 'done', `${vid.videoWidth}x${vid.videoHeight}`);
        setStatus('on', 'Monitoring');

        stream.getVideoTracks()[0].onended = stopCapture;

        // Setup Audio Recorder (Whisper)
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
          const audioStream = new MediaStream(audioTracks);
          const mediaRecorder = new MediaRecorder(audioStream, { mimeType: 'video/webm' }); // Chrome uses video/webm for audio chunks sometimes
          mediaRecorder.ondataavailable = async (e) => {
            if (e.data.size > 0) {
              const formData = new FormData();
              formData.append('audio', e.data, 'chunk.webm');
              try {
                const res = await fetch(`${API}/api/analyze/audio-chunk`, { method: 'POST', body: formData });
                const json = await res.json();
                if (json.text) {
                  pending += '\\n[AUDIO] ' + json.text;
                  allText += '\\n[AUDIO] ' + json.text;
                  addEntry('[?�성 감�?] ' + json.text, true);
                  $('charCount').textContent = allText.length + ' chars';
                  maybeAnalyze();
                }
              } catch (err) {
                console.error('Audio chunk error', err);
              }
            }
          };
          mediaRecorder.start(10000); // Request data every 10 seconds
        }

        startT = Date.now();
        clockTimer = setInterval(() => {
          const s = Math.floor((Date.now() - startT) / 1000);
          $('timer').textContent = `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
        }, 1000);

        await initOCR();
        // Start continuous OCR loop (no fixed interval ??runs as fast as API allows)
        ocrLoop();

        // Pop out as floating window
        openFloatingPanel();

      } catch (e) {
        setStep('capture', 'fail', e.message);
        setStatus('err', 'Failed');
      }
    }

    async function openFloatingPanel() {
      // Try Document PiP API first (Chrome 116+)
      if ('documentPictureInPicture' in window) {
        try {
          pipWindow = await documentPictureInPicture.requestWindow({
            width: 380,
            height: 620
          });

          // Copy styles
          const style = pipWindow.document.createElement('style');
          style.textContent = document.querySelector('style').textContent;
          pipWindow.document.head.appendChild(style);

          // Copy fonts
          document.querySelectorAll('link[rel="preconnect"], link[href*="fonts"]').forEach(l => {
            pipWindow.document.head.appendChild(l.cloneNode(true));
          });

          pipWindow.document.title = 'FactLens';
          pipWindow.document.body.style.cssText = 'font-family:var(--font);background:var(--bg);color:var(--text);margin:0;overflow:hidden;display:flex;flex-direction:column;height:100vh;';

          // Move active content to PiP window
          const content = $('activeContent');
          pipWindow.document.body.appendChild(content);
          content.style.display = 'flex';

          // When PiP closes, move content back
          pipWindow.addEventListener('pagehide', () => {
            document.body.insertBefore(content, $('vidWrap'));
            content.style.display = 'flex';
            pipWindow = null;
          });

          return;
        } catch (e) {
          console.log('[FactLens] PiP failed, using popup:', e);
        }
      }

      // Fallback: window.open popup
      const w = 380, h = 620;
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
          content.style.display = 'flex';
          pipWindow = null;
        });
      }
    }

    function stopCapture() {
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      if (ocrTimer) { clearInterval(ocrTimer); ocrTimer = null; }
      if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }

      const content = $('activeContent') || (pipWindow && pipWindow.document.getElementById('activeContent'));
      if (pipWindow) {
        try {
          if (content) document.body.insertBefore(content, $('vidWrap'));
          pipWindow.close();
        } catch(e) {}
        pipWindow = null;
      }

      $('vid').srcObject = null;
      $('startScreen').style.display = '';
      if ($('activeContent')) $('activeContent').style.display = 'none';
      $('floatStop').classList.remove('show');
      setStatus('', 'Stopped');
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

    async function initOCR() {
      setStep('ocr', 'running', 'Checking server...');
      try {
        const res = await fetch(`${API}/api/health`);
        if (res.ok) {
          ocrReady = true;
          setStep('ocr', 'done', 'OCR.space ready');
        } else {
          throw new Error('Server not reachable');
        }
      } catch (e) {
        setStep('ocr', 'fail', e.message);
      }
    }

    let activeRequests = 0;
    
    async function runOCR() {
      if (!stream || !ocrReady) return;
      if (activeRequests >= 5) {
        // Too many concurrent requests, wait a bit
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

      // Scale to max 1280px wide (balance between speed and accuracy)
      const scale = Math.min(1, 1280 / vw);
      cvs.width = Math.round(vw * scale);
      cvs.height = Math.round(vh * scale);
      
      // Use better smoothing for downscaling
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(vid, 0, 0, cvs.width, cvs.height);

      // Smart Cropping (Pixel Diff)
      let currentCropX = 0;
      let currentCropY = 0;
      const imageData = ctx.getImageData(0, 0, cvs.width, cvs.height);
      const data = imageData.data;
      let minX = cvs.width, minY = cvs.height, maxX = 0, maxY = 0;
      let changedPixels = 0;

      if (lastImageData) {
        const lastData = lastImageData.data;
        // Check every 4th pixel for speed
        for (let i = 0; i < data.length; i += 16) {
          const diff = Math.abs(data[i] - lastData[i]) + Math.abs(data[i+1] - lastData[i+1]) + Math.abs(data[i+2] - lastData[i+2]);
          if (diff > 45) { // Motion threshold
            changedPixels++;
            const idx = i / 4;
            const x = idx % cvs.width;
            const y = Math.floor(idx / cvs.width);
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      lastImageData = imageData;

      let dataUrl;
      if (changedPixels < 100 && lastImageData) {
        // Video is paused or static screen
        setStep('ocr', 'skip', 'Static (API Saved)');
        ocrBusy = false;
        setTimeout(runOCR, 500); // Check again soon
        return;
      }

      // If we found a moving region, use it or fallback to last known bbox
      if (changedPixels >= 100) {
        lastBbox = { minX, minY, maxX, maxY };
      }

      if (lastBbox) {
        // Expand the bounding box slightly (increased to 50px to avoid cutting off edge text)
        const pad = 50;
        let cropX = Math.max(0, lastBbox.minX - pad);
        let cropY = Math.max(0, lastBbox.minY - pad);
        let cropW = Math.min(cvs.width - cropX, (lastBbox.maxX - lastBbox.minX) + pad * 2);
        let cropH = Math.min(cvs.height - cropY, (lastBbox.maxY - lastBbox.minY) + pad * 2);

        // Only crop if it's a reasonable size
        if (cropW > 150 && cropH > 150 && (cropW < cvs.width * 0.9 || cropH < cvs.height * 0.9)) {
          const cropCanvas = document.createElement('canvas');
          cropCanvas.width = cropW;
          cropCanvas.height = cropH;
          const cropCtx = cropCanvas.getContext('2d');
          cropCtx.putImageData(ctx.getImageData(cropX, cropY, cropW, cropH), 0, 0);
          dataUrl = cropCanvas.toDataURL('image/jpeg', 0.9);
          currentCropX = cropX;
          currentCropY = cropY;

          // --- LOOP DETECTION HASHING (Center 80% of video to ignore UI edges) ---
          const hashCvs = document.createElement('canvas');
          hashCvs.width = 16; hashCvs.height = 16;
          const cx = cropCanvas.width * 0.1;
          const cy = cropCanvas.height * 0.1;
          const cw = cropCanvas.width * 0.8;
          const ch = cropCanvas.height * 0.8;
          hashCvs.getContext('2d').drawImage(cropCanvas, cx, cy, cw, ch, 0, 0, 16, 16);
          const hData = hashCvs.getContext('2d').getImageData(0, 0, 16, 16).data;
          let sum = 0;
          for(let i=0; i<hData.length; i+=4) sum += (hData[i] + hData[i+1] + hData[i+2]) / 3;
          const avg = sum / 256;
          let hashStr = '';
          for(let i=0; i<hData.length; i+=4) {
            const gray = (hData[i] + hData[i+1] + hData[i+2]) / 3;
            hashStr += (gray > avg) ? '1' : '0';
          }
          
          const now = Date.now();
          // Store first 3 seconds of video (3000ms) for reliable loop detection
          if (now - videoStartTime < 3000) {
            videoStartFrames.push({ hash: hashStr, time: now });
          }
          
          // Check for loop (Hamming distance < 10 for strict match)
          // ONLY compare against the initial 3-second reference frames
          let isLoop = false;
          if (now - videoStartTime > 5000) { // Don't falsely trigger during the first 5 seconds
            for (const h of videoStartFrames) {
              let diff = 0;
              for(let i=0; i<256; i++) { if(h.hash[i] !== hashStr[i]) diff++; }
              if (diff < 10) { isLoop = true; break; }
            }
          }
          
          if (isLoop) {
            setStep('ocr', 'skip', 'Static (Loop Detected)');
            setTimeout(runOCR, 200);
            return;
          } else {
            if (frameHistory.length === 0 || now - frameHistory[frameHistory.length-1].time > 1000) {
              frameHistory.push({ hash: hashStr, time: now });
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
      
      // Immediately queue the next capture to run independently of this API response (5 FPS)
      setTimeout(runOCR, 200);

      try {
        const res = await fetch(`${API}/api/analyze/ocr`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: dataUrl })
        });
        const data = await res.json();

        if (data.error) {
          setStep('ocr', 'fail', data.error.slice(0, 50));
          return;
        }

        const txt = (data.text || '').trim();
        if (txt.length < 3) { setStep('ocr', 'done', 'No text'); return; }

        // Self-read guard
        const lower = txt.toLowerCase();
        const isSelf = SELF_KEYWORDS.filter(k => lower.includes(k)).length >= 2;
        if (isSelf) {
          if (!selfReadPaused) { selfReadPaused = true; addEntry('[PAUSED] Reading own UI', false); }
          setStep('ocr', 'skip', 'Self-read');
          return;
        }
        if (selfReadPaused) { selfReadPaused = false; addEntry('[RESUMED]', false); }

        // Show ALL detected lines with Spatial Tracking
        const rawLines = data.lines || [];
        const processedLines = [];
        const newSpatial = [];

        for (const line of rawLines) {
          if (!line.text || line.text.length < 2) continue;
          let matched = false;
          let isStatic = false;
          
          // Add crop offset back to OCR coordinates to get absolute screen coordinates
          const absCx = line.cx + currentCropX;
          const absCy = line.cy + currentCropY;

          for (const mem of spatialMemory) {
            // Check if coordinates are close (within 30px)
            if (Math.abs(absCx - mem.cx) < 30 && Math.abs(absCy - mem.cy) < 30) {
              if (jaccard(line.text, mem.text) > 0.4) {
                mem.count++;
                mem.text = line.text; // update to latest OCR
                mem.lastSeen = Date.now();
                isStatic = mem.count > 15; // 3 seconds at 5 FPS -> prevents subtitles from becoming static
                newSpatial.push(mem);
                matched = true;
                break;
              }
            }
          }
          
          if (!matched) {
            newSpatial.push({ text: line.text, cx: absCx, cy: absCy, count: 1, lastSeen: Date.now() });
          }
          
          if (isStatic) {
            processedLines.push(`[고정] ${line.text}`);
          } else {
            processedLines.push(`[?�막] ${line.text}`);
          }
        }
        
        // Video Transition Detection
        let maxStaticText = '';
        let maxLength = 0;
        for (const mem of newSpatial) {
          // Ignore very short texts like '2' or '공유'
          if (mem.count > 15 && mem.text.length > 10 && mem.text.length > maxLength) {
            maxLength = mem.text.length;
            maxStaticText = mem.text;
          }
        }

        if (maxStaticText) {
          if (!currentVideoTitle) {
            currentVideoTitle = maxStaticText;
            addEntry(`========== �??�상 감�?: ${maxStaticText} ==========`, false);
            updateTitleUI();
          } else {
            // Only trigger transition if the new title is significantly different
            if (jaccard(currentVideoTitle, maxStaticText) < 0.5) {
              addEntry(`========== ???�상 감�?: ${maxStaticText} ==========`, false);
              fetch(`${API}/api/analyze/archive`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: currentVideoTitle, rawText: allText, facts: sessionFacts })
              }).catch(e => console.error('Archive failed:', e));

              // Context Reset
              allText = '';
              pending = '';
              sessionFacts = [];
              lastText = '';
              $('charCount').textContent = '0 chars';
              $('results').classList.remove('show');
              
              currentVideoTitle = maxStaticText;
              updateTitleUI();
            } else {
              // Same video, just minor OCR spelling update
              currentVideoTitle = maxStaticText;
              updateTitleUI();
            }
          }
        }

        function updateTitleUI() {
          let titleEl = $('currentTitle');
          if (!titleEl) {
            titleEl = document.createElement('div');
            titleEl.id = 'currentTitle';
            titleEl.style = 'background: #e3f2fd; color: #1976d2; padding: 10px; border-radius: 8px; margin-bottom: 10px; font-weight: bold; text-align: center;';
            const log = $('log');
            log.parentNode.insertBefore(titleEl, log);
          }
          titleEl.textContent = `?�재 ?�상: ${currentVideoTitle}`;
        }
        
        // Keep old memory if seen within last 5 seconds, to handle flicker
        for (const mem of spatialMemory) {
          if (!newSpatial.includes(mem) && Date.now() - mem.lastSeen < 5000) {
            newSpatial.push(mem);
          }
        }
        spatialMemory = newSpatial;

        const freshLines = [];
        for (const mem of newSpatial) {
           if (mem.text.length > 2) {
              // Check if we already logged this exact text
              if (!allText.includes(mem.text)) {
                 const tag = mem.count > 15 ? '[고정]' : '[?�막]';
                 freshLines.push(`${tag} ${mem.text}`);
              }
           }
        }
        
        if (freshLines.length > 0) {
           const freshText = freshLines.join('\n');
           pending += '\n' + freshText;
           allText += '\n' + freshText;
           // Display clean sentences in the UI
           addEntry(freshText, true);
           
           $('charCount').textContent = allText.length + ' chars';
           setStep('ocr', 'done', `${freshLines.length} new lines added`);
           
           // Fetch and update quota usage
           fetch(`${API}/api/analyze/quota`)
             .then(r => r.json())
             .then(data => {
               const qEl = $('quotaInfo');
               if(qEl) qEl.textContent = `Google API: ${data.usage}/${data.limit}`;
             }).catch(e => {});

           maybeAnalyze();
        } else {
           setStep('ocr', 'done', 'No new subtitles');
        }
      } catch (e) {
        setStep('ocr', 'fail', e.message);
      } finally {
        activeRequests--;
      }
    }

    async function ocrLoop() {
      if (!stream || !ocrReady) return;
      runOCR(); // Start the loop
    }

    function jaccard(a, b) {
      if (!a || !b) return 0;
      const sa = new Set(a.split(/\s+/)), sb = new Set(b.split(/\s+/));
      const inter = [...sa].filter(w => sb.has(w)).length;
      const union = new Set([...sa, ...sb]).size;
      return union > 0 ? inter / union : 0;
    }

    function findNew(old, fresh) {
      const oldW = new Set(old.toLowerCase().split(/\s+/).filter(w => w.length > 2));
      return fresh.split(/\s+/).filter(w => !oldW.has(w.toLowerCase()) && w.length > 2).join(' ');
    }

    function maybeAnalyze() {
      if (analyzing || pending.trim().length < MIN_NEW || (Date.now() - lastSend) < SEND_COOLDOWN) return;
      analyze();
    }

    async function analyze() {
      if (analyzing || !allText.trim()) return;
      analyzing = true;
      lastSend = Date.now();
      const txt = allText;
      pending = '';

      setStep('extract', 'running', 'Sending...');
      setStatus('on', 'Analyzing...');

      try {
        const res = await fetch(`${API}/api/analyze/text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: txt })
        });
        const report = await res.json();

        if (report.progress?.steps) {
          for (const [k, v] of Object.entries(report.progress.steps)) {
            setStep(k, v.status, v.detail || '');
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
        setStatus('err', 'Error');
      } finally {
        analyzing = false;
      }
    }

    function renderFacts(report) {
      const el = $('results');
      el.classList.add('show');
      $('factCount').textContent = report.facts.length + ' facts';
      
      $('factsBody').innerHTML = report.facts.map((f, i) => {
        const v = f.verification || {};
        const st = (v.status || 'unverified').toLowerCase();
        const srcs = v.sources || [];
        return `<div class="fact fact-${st}" onclick="this.classList.toggle('open')">
          <div class="fact-hdr">
            <span class="fact-n">${i+1}</span>
            <span class="fact-claim">${esc(f.claim)}</span>
            <span class="fact-arrow">??/span>
          </div>
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

    // ?�?� Helpers ?�?�
    function setStep(id, s, detail) {
      const el = $(`s-${id}`);
      if (!el) return;
      el.dataset.s = s;
      const icon = el.querySelector('.step-icon');
      const st = el.querySelector('.step-st');
      if (s === 'running') icon.innerHTML = '<div class="spinner"></div>';
      else if (s === 'done') icon.textContent = 'OK';
      else if (s === 'fail') icon.textContent = '!';
      else icon.textContent = '-';
      st.textContent = detail || '';
    }

    function setStatus(type, txt) {
      $('dot').className = 'dot' + (type ? ' ' + type : '');
      $('status').textContent = txt;
    }

    function addEntry(text, isNew) {
      const body = $('feedBody');
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

    function esc(t) { const d = document.createElement('div'); d.textContent = t||''; return d.innerHTML; }

    // Ctrl+Shift+D = force analyze
    document.addEventListener('keydown', e => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') { e.preventDefault(); if (allText.trim()) { pending = allText; analyze(); } }
    });
  


