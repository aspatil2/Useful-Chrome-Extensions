chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analyze_ats') {
    handleAnalysis(request.payload)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }
});

async function handleAnalysis({ resumeText, jobDescription, apiUrl, apiKey, apiModel }) {
  if (!apiUrl) {
    throw new Error('API URL is not configured.');
  }

  const prompt = `
You are an expert technical recruiter and ATS (Applicant Tracking System) parser.
I will provide you with a Job Description and my Resume.
Your task is to:
1. Provide an ATS match score out of 100 representing how well the resume matches the job description.
2. List up to 10 critical hard skills or keywords missing from the resume that the job description requires.
3. Provide a brief 1-2 sentence recommendation on how to improve the resume.

# Job Description
${jobDescription}

# Resume
${resumeText}

Respond ONLY in valid JSON format with the following structure:
{
  "score": (integer 0-100),
  "missing_keywords": ["keyword1", "keyword2"],
  "recommendation": "string"
}`;

  try {
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Default to handling OpenAI-compatible endpoints (OpenRouter, LM Studio, Ollama)
    // Assume standard /v1/chat/completions structure
    const body = {
      model: apiModel || 'local-model',
      messages: [
        { role: 'system', content: 'You are a helpful ATS parsing assistant.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' } // Attempt to enforce JSON if supported
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      let preview = responseText.substring(0, 100).replace(/\n/g, ' ');
      throw new Error(`The API URL returned an invalid response (not JSON). Did you provide the full completion endpoint (e.g., /v1/chat/completions)?\nPreview: ${preview}`);
    }
    let content = data.choices[0].message.content;
    
    // Clean up markdown wrapping if present
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(content);
  } catch (err) {
    console.error('Analysis failed:', err);
    throw err;
  }
}
