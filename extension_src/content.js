chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extract_job_description') {
    let text = extractText();
    sendResponse({ text });
  }
});

function extractText() {
  // A simple heuristic: Try to find common job description containers
  const selectors = [
    '#job-details', '.job-description', '[data-test="job-description"]', 
    'article', 'main'
  ];
  
  for (let selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.innerText.length > 500) {
      return element.innerText;
    }
  }

  // Fallback to body if no specific container is found
  // Remove scripts, styles, and navs before extracting innerText
  const clone = document.body.cloneNode(true);
  const elementsToRemove = clone.querySelectorAll('script, style, nav, header, footer, noscript, svg');
  elementsToRemove.forEach(el => el.remove());
  
  return clone.innerText.trim();
}
