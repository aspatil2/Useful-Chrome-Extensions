const pdfjsLib = window.pdfjsLib;

pdfjsLib.GlobalWorkerOptions.workerSrc = './lib/pdf.worker.min.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Tab Switching Logic
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove active classes
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.style.display = 'none');
      
      // Add active to clicked
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId).style.display = 'block';
    });
  });

  // Load Settings from Storage
  chrome.storage.local.get(['apiUrl', 'apiKey', 'apiModel', 'resumeText'], (result) => {
    if (result.apiUrl) document.getElementById('apiUrl').value = result.apiUrl;
    if (result.apiKey) document.getElementById('apiKey').value = result.apiKey;
    if (result.apiModel) document.getElementById('apiModel').value = result.apiModel;
    
    if (result.resumeText) {
      document.getElementById('uploadText').innerText = '✅ Resume Saved in Storage';
      setStatus('resumeStatus', 'Resume loaded successfully.', 'text-success');
    } else {
      setStatus('resumeStatus', 'No resume loaded. Please upload one.', 'text-warning');
    }
  });

  // Save Settings
  document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    const apiUrl = document.getElementById('apiUrl').value.trim();
    const apiKey = document.getElementById('apiKey').value.trim();
    const apiModel = document.getElementById('apiModel').value.trim();
    
    chrome.storage.local.set({ apiUrl, apiKey, apiModel }, () => {
      setStatus('settingsStatus', 'Settings saved successfully!', 'text-success');
      setTimeout(() => setStatus('settingsStatus', '', ''), 3000);
    });
  });

  // Handle PDF Upload
  document.getElementById('resumeUpload').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file || file.type !== 'application/pdf') {
      setStatus('resumeStatus', 'Please select a valid PDF file.', 'text-error');
      return;
    }

    setStatus('resumeStatus', 'Parsing PDF...', 'text-warning');
    document.getElementById('uploadText').innerText = `📄 ${file.name}`;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
      }
      
      if (!fullText.trim()) throw new Error("No readable text found in PDF.");

      chrome.storage.local.set({ resumeText: fullText }, () => {
        setStatus('resumeStatus', 'Resume parsed and saved!', 'text-success');
      });
    } catch (err) {
      console.error(err);
      setStatus('resumeStatus', `Error parsing: ${err.message}`, 'text-error');
    }
  });

  // Handle Analysis Action
  document.getElementById('analyzeBtn').addEventListener('click', async () => {
    const loading = document.getElementById('loadingIndicator');
    const resultsArea = document.getElementById('resultsArea');
    const analyzeBtn = document.getElementById('analyzeBtn');
    
    const settings = await chrome.storage.local.get(['apiUrl', 'apiKey', 'apiModel', 'resumeText']);
    
    if (!settings.resumeText) {
      alert('Please upload a resume in the Settings tab first.');
      return;
    }
    if (!settings.apiUrl) {
      alert('Please configure the API URL in the Settings tab.');
      return;
    }

    try {
      analyzeBtn.disabled = true;
      resultsArea.style.display = 'none';
      loading.style.display = 'block';
      document.getElementById('loadingStatus').innerText = 'Extracting job description...';

      // 1. Get current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error("Could not find active tab");

      // Check if viewing a restricted chrome:// URL
      if (tab.url.startsWith('chrome://')) {
        throw new Error("Cannot run on Chrome system pages.");
      }

      // 2. Extract job description via content script
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractTextFromPage
      });

      if (!result) throw new Error("Could not extract text from this page.");

      document.getElementById('loadingStatus').innerText = 'Analyzing with LLM...';

      // 3. Send to background for LLM processing
      const response = await chrome.runtime.sendMessage({
        action: 'analyze_ats',
        payload: {
          resumeText: settings.resumeText,
          jobDescription: result,
          apiUrl: settings.apiUrl,
          apiKey: settings.apiKey,
          apiModel: settings.apiModel
        }
      });

      if (!response || !response.success) {
        throw new Error(response ? response.error : 'Unknown error occurred.');
      }

      displayResults(response.data);

    } catch (err) {
      alert(`Analysis failed: ${err.message}`);
    } finally {
      loading.style.display = 'none';
      analyzeBtn.disabled = false;
    }
  });
});

// Helper functions (executed in content context via executeScript)
function extractTextFromPage() {
  const selectors = ['#job-details', '.job-description', '[data-test="job-description"]', 'article', 'main'];
  for (let s of selectors) {
    const el = document.querySelector(s);
    if (el && el.innerText.length > 500) return el.innerText;
  }
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll('script, style, nav, header, footer, noscript, svg').forEach(el => el.remove());
  return clone.innerText.trim();
}

// UI Helpers
function setStatus(elementId, message, className) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.innerText = message;
  el.className = `status-msg ${className}`;
}

function displayResults(data) {
  document.getElementById('resultsArea').style.display = 'block';
  
  // Score Ring Logic
  const scoreEl = document.getElementById('atsScoreValue');
  const scoreCircle = document.querySelector('.score-circle');
  
  const score = parseInt(data.score) || 0;
  scoreEl.innerText = score;
  
  // Update ring color and percentage
  let color = 'var(--danger)';
  if (score > 40) color = 'var(--warning)';
  if (score > 75) color = 'var(--success)';
  
  scoreCircle.style.background = `conic-gradient(${color} ${score}%, var(--border-color) ${score}%)`;

  // Missing Keywords list
  const listEl = document.getElementById('missingKeywordsList');
  listEl.innerHTML = '';
  if (data.missing_keywords && Array.isArray(data.missing_keywords)) {
    data.missing_keywords.forEach(kw => {
      const li = document.createElement('li');
      li.innerText = kw;
      listEl.appendChild(li);
    });
  } else {
    listEl.innerHTML = '<li>None identified</li>';
  }

  // Recommendation text
  document.getElementById('recommendationText').innerText = data.recommendation || 'No specific recommendation provided.';
}
