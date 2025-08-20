// CONFIG object is loaded from config.js
document.addEventListener('DOMContentLoaded', function() {
  const themeToggle = document.getElementById('theme-toggle');
  const themeIcon = document.getElementById('theme-icon');
  const body = document.body;
  const summarizeBtn = document.getElementById('summarize');
  const copyBtn = document.getElementById('copy-btn');
  const exportTxtBtn = document.getElementById('export-txt');
  const exportMdBtn = document.getElementById('export-md');
  const summaryTypeButtons = document.querySelectorAll('.btn-type');
  const result = document.getElementById('result');
  
  let selectedSummaryType = 'brief'; // Default selection

  // Summary type button selection
  summaryTypeButtons.forEach(button => {
    button.addEventListener('click', function() {
      // Remove active class from all buttons
      summaryTypeButtons.forEach(btn => btn.classList.remove('active'));
      
      // Add active class to clicked button
      this.classList.add('active');
      
      // Update selected summary type
      selectedSummaryType = this.getAttribute('data-type');
      
      console.log('Selected summary type:', selectedSummaryType);
    });
  });

  // Initialize dark mode from storage
  chrome.storage.sync.get([CONFIG.ui.darkModeStorageKey], (result) => {
    if (result[CONFIG.ui.darkModeStorageKey]) {
      body.classList.add('dark-mode');
      themeIcon.textContent = '☀️';
    }
  });

  // Theme toggle functionality
  themeToggle.addEventListener('click', function() {
    body.classList.toggle('dark-mode');
    const isDark = body.classList.contains('dark-mode');
    themeIcon.textContent = isDark ? '☀️' : '🌙';
    const storageObj = {};
    storageObj[CONFIG.ui.darkModeStorageKey] = isDark;
    chrome.storage.sync.set(storageObj);
  });

  // Summarize functionality
  summarizeBtn.addEventListener('click', async function() {
    const summaryType = selectedSummaryType;
    
    // Show loading state
    result.innerHTML = `
      <div class="loading">
        <div class="loader"></div>
        <div class="loading-text">Generating ${summaryType.replace('-', ' ')} summary...</div>
      </div>
    `;

    // Get API key from storage
    chrome.storage.sync.get(["geminiApiKey"], async (storageResult) => {
      if (!storageResult.geminiApiKey) {
        result.innerHTML = 'API key not found. Please set your API key in the extension options. <br><br><button onclick="chrome.runtime.openOptionsPage()" style="background: #4285f4; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">Open Settings</button>';
        return;
      }

      // Get current tab
      chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
        // Check if we can run content scripts on this tab
        const url = tab.url;
        if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('moz-extension://') || url.startsWith('edge://') || url.startsWith('about:')) {
          result.innerText = "Cannot summarize browser internal pages. Please navigate to a regular website.";
          return;
        }

        // Send message to content script (it should already be loaded via manifest)
        chrome.tabs.sendMessage(
          tab.id,
          { type: "GET_ARTICLE_TEXT" },
          async (res) => {
            // Check for chrome.runtime.lastError
            if (chrome.runtime.lastError) {
              console.error('Runtime error:', chrome.runtime.lastError);
              
              // Try to inject content script as fallback
              try {
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  files: ['content.js']
                });
                
                // Retry sending message after injection
                setTimeout(() => {
                  chrome.tabs.sendMessage(tab.id, { type: "GET_ARTICLE_TEXT" }, async (retryRes) => {
                    if (chrome.runtime.lastError) {
                      result.innerText = "Could not access page content. Try refreshing the page and try again.";
                      return;
                    }
                    
                    if (!retryRes || !retryRes.text || retryRes.text.trim().length < 50) {
                      result.innerText = "Could not extract meaningful text from this page. Make sure you're on a page with readable content.";
                      return;
                    }

                    try {
                      const summary = await getGeminiSummary(
                        retryRes.text,
                        summaryType,
                        storageResult.geminiApiKey
                      );
                      result.innerText = summary;
                    } catch (error) {
                      console.error('Gemini API error:', error);
                      result.innerText = `Error: ${error.message || "Failed to generate summary."}`;
                    }
                  });
                }, 500);
                
              } catch (injectionError) {
                console.error('Script injection failed:', injectionError);
                result.innerText = "Cannot access this page. Please try on a different website or refresh the page.";
              }
              return;
            }

            if (!res || !res.text || res.text.trim().length < 50) {
              result.innerText = "Could not extract meaningful text from this page. Make sure you're on a page with readable content.";
              return;
            }

            try {
              const summary = await getGeminiSummary(
                res.text,
                summaryType,
                storageResult.geminiApiKey
              );
              result.innerText = summary;
            } catch (error) {
              console.error('Gemini API error:', error);
              result.innerText = `Error: ${error.message || "Failed to generate summary."}`;
            }
          }
        );
      });
    });
  });

  // Copy functionality
  copyBtn.addEventListener('click', function() {
    const text = result.textContent;
    if (text && text.trim() !== "" && !text.includes('Select a summary type') && !text.includes('API key not found')) {
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.classList.add('success-flash');
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '<span>✅</span> Copied!';
        setTimeout(() => {
          copyBtn.innerHTML = originalText;
          copyBtn.classList.remove('success-flash');
        }, CONFIG.ui.copyButtonTimeout);
      }).catch((err) => {
        console.error("Failed to copy text: ", err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          copyBtn.innerHTML = '<span>✅</span> Copied!';
          setTimeout(() => {
            copyBtn.innerHTML = originalText;
          }, CONFIG.ui.copyButtonTimeout);
        } catch (err2) {
          console.error('Fallback copy failed:', err2);
        }
        document.body.removeChild(textArea);
      });
    }
  });

  // Export as TXT
  exportTxtBtn.addEventListener('click', function() {
    const summaryText = result.textContent;
    if (summaryText && summaryText.trim() !== "" && !summaryText.includes("Select a summary type") && !summaryText.includes("API key not found")) {
      try {
        // Try using Chrome downloads API first
        const blob = new Blob([summaryText], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        
        chrome.downloads.download({
          url: url,
          filename: CONFIG.export.defaultTxtFilename,
          saveAs: true
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            console.log('Chrome downloads API failed, using fallback');
            fallbackDownload(summaryText, CONFIG.export.defaultTxtFilename, 'text/plain');
          }
          URL.revokeObjectURL(url);
        });
      } catch (error) {
        console.error('Export failed:', error);
        fallbackDownload(summaryText, CONFIG.export.defaultTxtFilename, 'text/plain');
      }
    }
  });

  // Export as MD
  exportMdBtn.addEventListener('click', function() {
    const summaryText = result.textContent;
    if (summaryText && summaryText.trim() !== "" && !summaryText.includes("Select a summary type") && !summaryText.includes("API key not found")) {
      let mdContent = `# AI Summary\n\n`;
      
      // Add metadata
      const date = new Date().toLocaleString();
      const summaryTypeLabel = selectedSummaryType.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
      mdContent += `**Generated on:** ${date}\n`;
      mdContent += `**Summary type:** ${summaryTypeLabel}\n`;
      mdContent += `**Source:** ${window.location ? 'Current webpage' : 'Webpage'}\n\n`;
      mdContent += `---\n\n`;
      
      // Add the summary content
      mdContent += summaryText;
      
      try {
        // Try using Chrome downloads API first
        const blob = new Blob([mdContent], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        
        chrome.downloads.download({
          url: url,
          filename: CONFIG.export.defaultMdFilename,
          saveAs: true
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            console.log('Chrome downloads API failed, using fallback');
            fallbackDownload(mdContent, CONFIG.export.defaultMdFilename, 'text/markdown');
          }
          URL.revokeObjectURL(url);
        });
      } catch (error) {
        console.error('Export failed:', error);
        fallbackDownload(mdContent, CONFIG.export.defaultMdFilename, 'text/markdown');
      }
    }
  });
});

// Fallback download function for when Chrome downloads API is not available
function fallbackDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Gemini API function
async function getGeminiSummary(text, summaryType, apiKey) {
  // Truncate very long texts to avoid API limits
  const maxLength = CONFIG.api.maxTextLength;
  const truncatedText =
    text.length > maxLength ? text.substring(0, maxLength) + "..." : text;

  console.log("Generating summary with type:", summaryType);

  let prompt;
  switch (summaryType) {
    case "brief":
      prompt = `Provide a brief summary of the following article in 2-3 sentences:\n\n${truncatedText}`;
      break;
    case "detailed":
      prompt = `Provide a detailed summary of the following article, covering all main points and key details:\n\n${truncatedText}`;
      break;
    case "bullets":
      prompt = `Summarize the following article in 5-7 key bullet points. Format your response exactly like this example:

• First key point about the topic
• Second important insight 
• Third main finding or argument
• Fourth significant detail
• Fifth crucial point
• Sixth relevant information
• Seventh summary point

Make sure to use the bullet symbol (•) at the start of each line, followed by a space. Keep each point concise but informative.

Article text:
${truncatedText}`;
      break;
    case "key-insights":
      prompt = `Extract the key insights from the following article and present them in a structured format:

🔍 Key Insights:

1. [First major insight]
2. [Second important finding]
3. [Third significant point]
4. [Fourth key takeaway]
5. [Fifth important aspect]

Article text:
${truncatedText}`;
      break;
    default:
      console.log("Unknown summary type, using default:", summaryType);
      prompt = `Summarize the following article:\n\n${truncatedText}`;
  }

  console.log("Using prompt for", summaryType, ":", prompt.substring(0, 100) + "...");

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.api.model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { 
          "Content-Type": "application/json; charset=utf-8"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: CONFIG.api.temperature,
          },
        }),
      }
    );

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API request failed with status ${res.status}`);
    }

    const data = await res.json();
    const summary = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No summary available.";
    
    // Clean up any encoding issues in the response
    return summary.replace(/â€¢/g, '•').replace(/â€™/g, "'").replace(/â€œ/g, '"').replace(/â€/g, '"');
    
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error(`Failed to generate summary: ${error.message}`);
  }
}