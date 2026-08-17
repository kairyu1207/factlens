const fs = require('fs');

const path = 'C:\\Users\\seong\\.gemini\\antigravity-ide\\scratch\\factlens\\web\\index.html';
let html = fs.readFileSync(path, 'utf8');

// 1. Add Search Execution Log UI
html = html.replace(
  /<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<!-- Integrated Source Verification \(Three Circles UI\) -->/,
  `          </div>
            </div>

            <h3 style="margin:0; font-size:12px; color: #fff; text-transform: uppercase; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px; margin-top: 15px;">[STEP 5-2] 팩트 검증 검색 로그 (Search Logs)</h3>
            
            <div style="display: flex; flex-direction: column; gap: 10px;">
              <div style="display: flex; flex-direction: column;">
                <h4 style="margin:0 0 4px 0; font-size:10px; color: #3b82f6;">실제 실행된 구글 검색어</h4>
                <div id="searchExecutionLog" style="width: 100%; height: 80px; overflow-y: auto; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.05); color: #93c5fd; border-radius: 4px; padding: 6px; font-family: monospace; font-size: 10px; white-space: pre-wrap; word-break: break-all;">대기 중...</div>
              </div>
            </div>

          </div>
        </div>
        
        <!-- Integrated Source Verification (Three Circles UI) -->`
);

// 2. Add escapeHTML function
html = html.replace(
  /function renderThreeCircles\(data\) \{/,
  `function escapeHTML(str) {
      return (str || '').replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
      }[tag] || tag));
    }
  
    function renderThreeCircles(data) {`
);

// 3. Update analyze() to populate searchExecutionLog
html = html.replace(
  /if \(verifyReport\.success\) \{[\s\S]*?renderThreeCircles\(verifyReport\);\s*\}/,
  `if (verifyReport.success) {
            setStep('extract', 'done', \`\${verifyReport.verifiedCount} verified\`);
            globalFacts = [...globalFacts, ...verifyReport.results];
            renderThreeCircles(verifyReport);
            
            const searchLog = $('searchExecutionLog');
            if (searchLog && searchLog.textContent === '대기 중...') searchLog.textContent = '';
            if (searchLog) {
              verifyReport.results.forEach(r => {
                if (r.searchQuery) {
                  searchLog.textContent += \`[Search] \${r.searchQuery}\\n\`;
                }
              });
              searchLog.scrollTop = searchLog.scrollHeight;
            }
          }`
);

// 4. Update resetUI to clear searchExecutionLog
html = html.replace(
  /\$\('infoExtractionLog'\)\.textContent = '대기 중\.\.\.';/,
  `$('infoExtractionLog').textContent = '대기 중...';
      const searchLog = $('searchExecutionLog'); if(searchLog) searchLog.textContent = '대기 중...';`
);

fs.writeFileSync(path, html);
console.log('Update complete.');
