const fs = require('fs');

const path = 'C:\\Users\\seong\\.gemini\\antigravity-ide\\scratch\\factlens\\web\\index.html';
let html = fs.readFileSync(path, 'utf8');

// 1. Remove the floating widget button
html = html.replace(/<!-- Floating Widget Button -->[\s\S]*?<\/button>/, '');

// 2. Change floating-circles-widget CSS to be integrated
html = html.replace(
  /\.floating-circles-widget \{[\s\S]*?\}/,
  `.floating-circles-widget {
      display: none;
      flex-direction: column;
      align-items: center;
      margin-top: 20px;
      padding: 20px;
      border-top: 1px solid var(--border);
    }`
);
html = html.replace(/@keyframes slideIn \{[\s\S]*?\}/, '');
html = html.replace(/\.floating-circles-widget\.show \{[\s\S]*?\}/, '.floating-circles-widget.show { display: flex; }');

// 3. Restructure Step 3 UI
html = html.replace(
  /<h3 style="margin:0; font-size:12px; color: #fff; text-transform: uppercase; border-bottom: 1px solid rgba\(255,255,255,0\.1\); padding-bottom: 5px;">\[STEP 3\] 대본 복원 \(Script Reconstruction\)<\/h3>[\s\S]*?<h3 style="margin:0; font-size:12px; color: #fff; text-transform: uppercase; border-bottom: 1px solid rgba\(255,255,255,0\.1\); padding-bottom: 5px;">\[STEP 4\] 주체 식별 \(Entity Resolution\)<\/h3>/,
  `<h3 style="margin:0; font-size:12px; color: #fff; text-transform: uppercase; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px;">[STEP 3] 대본 복원 (Script Reconstruction)</h3>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div style="display: flex; flex-direction: column;">
              <h4 style="margin:0 0 4px 0; font-size:10px; color: #a78bfa;">[Top] 복원된 대본</h4>
              <div id="reconTopLog" style="width: 100%; height: 70px; overflow-y: auto; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.05); color: #a78bfa; border-radius: 4px; padding: 6px; font-family: monospace; font-size: 10px; white-space: pre-wrap; word-break: break-all;">대기 중...</div>
            </div>
            
            <div style="display: flex; flex-direction: column;">
              <h4 style="margin:0 0 4px 0; font-size:10px; color: #a78bfa;">[Middle] 복원된 대본</h4>
              <div id="reconMiddleLog" style="width: 100%; height: 70px; overflow-y: auto; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.05); color: #a78bfa; border-radius: 4px; padding: 6px; font-family: monospace; font-size: 10px; white-space: pre-wrap; word-break: break-all;">대기 중...</div>
            </div>
            
            <div style="display: flex; flex-direction: column;">
              <h4 style="margin:0 0 4px 0; font-size:10px; color: #a78bfa;">[Bottom] 복원된 대본</h4>
              <div id="reconBottomLog" style="width: 100%; height: 70px; overflow-y: auto; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.05); color: #a78bfa; border-radius: 4px; padding: 6px; font-family: monospace; font-size: 10px; white-space: pre-wrap; word-break: break-all;">대기 중...</div>
            </div>
            
            <div style="display: flex; flex-direction: column;">
              <h4 style="margin:0 0 4px 0; font-size:10px; color: #a78bfa;">[Audio] 복원된 대본</h4>
              <div id="reconAudioLog" style="width: 100%; height: 70px; overflow-y: auto; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.05); color: #a78bfa; border-radius: 4px; padding: 6px; font-family: monospace; font-size: 10px; white-space: pre-wrap; word-break: break-all;">대기 중...</div>
            </div>
          </div>

          <h3 style="margin:0; font-size:12px; color: #fff; text-transform: uppercase; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px;">[STEP 4] 주체 식별 (Entity Resolution)</h3>`
);

// 4. Update JS logic to populate recon logs instead of contextAlignmentLog
html = html.replace(
  /if \(preData\.reconstructionLogs\?\.length\) \{[\s\S]*?cLog\.scrollTop = cLog\.scrollHeight;\s*\}\s*\}/,
  `if (preData.reconstructedScripts) {
        const rTop = $('reconTopLog'); if (rTop && rTop.textContent === '대기 중...') rTop.textContent = '';
        const rMid = $('reconMiddleLog'); if (rMid && rMid.textContent === '대기 중...') rMid.textContent = '';
        const rBot = $('reconBottomLog'); if (rBot && rBot.textContent === '대기 중...') rBot.textContent = '';
        const rAud = $('reconAudioLog'); if (rAud && rAud.textContent === '대기 중...') rAud.textContent = '';

        if (preData.reconstructedScripts.Top && rTop) {
          rTop.textContent = preData.reconstructedScripts.Top;
          rTop.scrollTop = rTop.scrollHeight;
        }
        if (preData.reconstructedScripts.Middle && rMid) {
          rMid.textContent = preData.reconstructedScripts.Middle;
          rMid.scrollTop = rMid.scrollHeight;
        }
        if (preData.reconstructedScripts.Bottom && rBot) {
          rBot.textContent = preData.reconstructedScripts.Bottom;
          rBot.scrollTop = rBot.scrollHeight;
        }
        if (preData.reconstructedScripts.Audio && rAud) {
          rAud.textContent = preData.reconstructedScripts.Audio;
          rAud.scrollTop = rAud.scrollHeight;
        }
      }`
);

// 5. Change `resetUI` to reset recon logs
html = html.replace(
  /\$\('contextAlignmentLog'\)\.textContent = '대기 중\.\.\.';/,
  `$('reconTopLog').textContent = '대기 중...';
      $('reconMiddleLog').textContent = '대기 중...';
      $('reconBottomLog').textContent = '대기 중...';
      $('reconAudioLog').textContent = '대기 중...';
      
      $('valTotal').textContent = '0';
      $('valVerified').textContent = '0';
      $('valUnverified').textContent = '0';
      
      if($('verifiedList')) $('verifiedList').innerHTML = '';
      if($('unverifiedList')) $('unverifiedList').innerHTML = '';
      const vSec = $('verifiedMemos'); if(vSec) vSec.style.display = 'none';
      const uSec = $('unverifiedMemos'); if(uSec) uSec.style.display = 'none';`
);

// 6. Restore UI HTML at the bottom of .content
html = html.replace(
  /<\/div>\s*<\/div>\s*<\/div>\s*<!-- Hidden video for capture -->/,
  `</div>
      </div>
      
      <!-- Integrated Source Verification (Three Circles UI) -->
      <div class="floating-circles-widget" id="results">
        <div class="circles-wrapper">
          <div class="circle-group">
            <!-- Total Facts -->
            <div class="circle green" id="circleTotal">
              <span class="circle-val" id="valTotal">0</span>
              <span class="circle-lbl">Total<br>Facts</span>
            </div>
            <!-- Verified -->
            <div class="circle blue" id="circleVerified" onclick="toggleMemoSection('verified')">
              <span class="circle-val" id="valVerified">0</span>
              <span class="circle-lbl">Verified<br>Sources</span>
            </div>
            <!-- Unverified/Refuted -->
            <div class="circle red" id="circleUnverified" onclick="toggleMemoSection('unverified')">
              <span class="circle-val" id="valUnverified">0</span>
              <span class="circle-lbl">Unverified<br>Refuted</span>
            </div>
          </div>
        </div>
  
        <!-- Memos Section -->
        <div style="display:flex; gap:20px; margin-top:20px; width:100%; justify-content:center;">
          <div id="verifiedMemos" class="memo-section" style="width: 48%; max-height: 400px;">
            <h4 style="margin: 0 0 10px 0; font-size: 12px; color: #93c5fd; border-bottom: 1px solid rgba(59,130,246,0.2); padding-bottom: 5px;">Verified Facts</h4>
            <div id="verifiedList"></div>
          </div>
    
          <div id="unverifiedMemos" class="memo-section" style="width: 48%; max-height: 400px;">
            <h4 style="margin: 0 0 10px 0; font-size: 12px; color: #fca5a5; border-bottom: 1px solid rgba(239,68,68,0.2); padding-bottom: 5px;">Unverified / Refuted Facts</h4>
            <div id="unverifiedList"></div>
          </div>
        </div>
      </div>

    </div>

  <!-- Hidden video for capture -->`
);

// 7. Re-add renderThreeCircles and toggle functions, remove window.openWidget
html = html.replace(
  /let globalFacts = \[\];\s*let widgetWindow = null;\s*window\.openWidget = function\(\) \{[\s\S]*?\};\s*function setStep\(id, s, detail\) \{/,
  `let globalFacts = [];
  
    function setStep(id, s, detail) {`
);

// Update analyze to call renderThreeCircles instead of postMessage
html = html.replace(
  /if \(widgetWindow && !widgetWindow\.closed\) \{\s*widgetWindow\.postMessage\(\{ type: 'NEW_FACTS', facts: verifyReport\.results \}, '\*'\);\s*\}/,
  `renderThreeCircles(verifyReport);`
);

// Add the functions back at the end before </script>
html = html.replace(
  /<\/script>\s*<\/body>/,
  `
    window.toggleMemoSection = function(type) {
      const verifiedSection = document.getElementById('verifiedMemos');
      const unverifiedSection = document.getElementById('unverifiedMemos');
      
      if (type === 'verified') {
        if (verifiedSection.style.display === 'block') {
          verifiedSection.style.display = 'none';
        } else {
          verifiedSection.style.display = 'block';
          unverifiedSection.style.display = 'none';
        }
      } else {
        if (unverifiedSection.style.display === 'block') {
          unverifiedSection.style.display = 'none';
        } else {
          unverifiedSection.style.display = 'block';
          verifiedSection.style.display = 'none';
        }
      }
      
      // Auto-scroll to bottom to see memos
      setTimeout(() => {
        const content = document.getElementById('activeContent');
        if(content) content.scrollTop = content.scrollHeight;
      }, 100);
    };
  
    window.toggleFactDetail = function(el) {
      const detail = el.querySelector('.fact-detail');
      if (detail) detail.classList.toggle('open');
    };
  
    window.toggleSourceMemo = function(event, srcId) {
      event.stopPropagation();
      const memo = document.getElementById(srcId);
      if (memo) memo.classList.toggle('open');
    };
  
    function renderThreeCircles(data) {
      const el = $('results');
      if(el) el.classList.add('show');
      
      const vTotal = $('valTotal'); if (vTotal) vTotal.textContent = globalFacts.length || 0;
      const vVerified = $('valVerified'); if (vVerified) vVerified.textContent = globalFacts.filter(f=>f.verification?.status==='VERIFIED').length || 0;
      const vUnverified = $('valUnverified'); if (vUnverified) vUnverified.textContent = globalFacts.filter(f=>f.verification?.status!=='VERIFIED').length || 0;
      
      const verifiedList = $('verifiedList');
      const unverifiedList = $('unverifiedList');
      
      if (!verifiedList || !unverifiedList) return;
      
      verifiedList.innerHTML = '';
      unverifiedList.innerHTML = '';
      
      globalFacts.forEach((f, i) => {
        const v = f.verification || {};
        const st = (v.status || 'UNVERIFIED');
        const isVerified = st === 'VERIFIED';
        const badgeClass = isVerified ? 'verified' : (st === 'REFUTED' ? 'refuted' : 'unverified');
        const srcs = v.sources || [];
        
        const sourceButtonsHTML = srcs.map((s, sIdx) => {
          const srcId = \`src_memo_\${i}_\${sIdx}\`;
          let credClass = 'source-cred-unknown';
          if (s.credibility?.level === 'high') credClass = 'source-cred-high';
          if (s.credibility?.level === 'medium') credClass = 'source-cred-medium';
          if (s.credibility?.level === 'low') credClass = 'source-cred-low';
  
          return \`
            <div class="source-btn" onclick="toggleSourceMemo(event, '\${srcId}')">
              ? \${escapeHTML(s.publisher || s.title || 'Source')}
            </div>
            <div id="\${srcId}" class="source-memo" onclick="event.stopPropagation()">
              <div class="source-memo-title">\${escapeHTML(s.title || 'Untitled Source')}</div>
              <a href="\${escapeHTML(s.url)}" target="_blank" class="source-memo-link">\${escapeHTML(s.url)}</a>
              <div style="margin-top:6px; font-size:10px; color:var(--text2);">
                Credibility: <span class="\${credClass}">\${escapeHTML(s.credibility?.level || 'unknown')}</span>
                \${s.credibility?.description ? \` - \${escapeHTML(s.credibility.description)}\` : ''}
              </div>
              \${s.snippet ? \`<div class="source-memo-quote">"\${escapeHTML(s.snippet)}"</div>\` : ''}
            </div>
          \`;
        }).join('');
  
        const factHTML = \`
          <div class="fact-card \${badgeClass}" onclick="toggleFactDetail(this)">
            <div class="fact-claim">\${escapeHTML(f.claim)}</div>
            <div class="fact-meta">
              <span class="fact-badge \${badgeClass}">\${st}</span>
              <span>Confidence: \${Math.round((v.confidence || 0) * 100)}%</span>
              <span>Sources: \${srcs.length}</span>
            </div>
            <div class="fact-detail">
              <div style="margin-bottom:8px;"><strong>Explanation:</strong> \${escapeHTML(v.explanation || 'No explanation provided.')}</div>
              <div><strong>Sources:</strong></div>
              \${sourceButtonsHTML || '<div style="color:var(--text3);font-size:11px;margin-top:4px;">No sources found.</div>'}
            </div>
          </div>
        \`;
        
        if (isVerified) {
          verifiedList.innerHTML += factHTML;
        } else {
          unverifiedList.innerHTML += factHTML;
        }
      });
      
      // Auto scroll to bottom smoothly
      const content = document.getElementById('activeContent');
      if(content) {
         content.scrollTo({ top: content.scrollHeight, behavior: 'smooth' });
      }
    }
  </script>
</body>`
);

fs.writeFileSync(path, html);
console.log('Update complete.');
