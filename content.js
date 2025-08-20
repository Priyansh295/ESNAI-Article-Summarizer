// Content script for extracting article text
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.type === "GET_ARTICLE_TEXT") {
    try {
      const text = getArticleText();
      sendResponse({ text });
    } catch (error) {
      console.error('Error extracting text:', error);
      sendResponse({ text: "Error extracting text from this page." });
    }
  }
  return true; // Keep the message channel open for async response
});

function getArticleText() {
  // Check if current page is a PDF
  if (isPDF()) {
    return extractPDFText();
  }

  // Special handling for Medium articles
  if (window.location.hostname.includes('medium.com')) {
    return extractMediumArticleText();
  }

  // Try to find the main article content using various strategies
  let articleText = '';
  
  // Strategy 1: Look for article tag
  const article = document.querySelector("article");
  if (article && article.innerText.length > 200) {
    articleText = article.innerText;
  } else {
    // Strategy 2: Try common content selectors
    const contentSelectors = [
      '.post-content',
      '.entry-content',
      '.article-content',
      '.story-content',
      '.content',
      '[role="main"]',
      'main',
      '.post-body',
      '.article-body'
    ];

    for (const selector of contentSelectors) {
      const element = document.querySelector(selector);
      if (element && element.innerText.length > 200) {
        articleText = element.innerText;
        break;
      }
    }

    // Strategy 3: Fallback to paragraphs
    if (!articleText) {
      const paragraphs = Array.from(document.querySelectorAll("p"));
      const filteredParagraphs = paragraphs.filter(p => {
        const text = p.innerText.trim();
        return text.length > 20 && !isNavigationOrAd(p);
      });
      
      if (filteredParagraphs.length > 0) {
        articleText = filteredParagraphs.map(p => p.innerText).join("\n\n");
      }
    }
  }

  // Extract image descriptions if available
  const imageDescriptions = extractImageDescriptions();
  
  // Combine text and image descriptions
  let finalText = articleText;
  if (imageDescriptions) {
    finalText += "\n\n" + imageDescriptions;
  }

  // Clean up the text
  finalText = cleanText(finalText);

  return finalText || "Could not extract meaningful text from this page.";
}

// Helper function to identify navigation or ad elements
function isNavigationOrAd(element) {
  const classList = element.className.toLowerCase();
  const id = element.id.toLowerCase();
  
  const excludeKeywords = ['nav', 'menu', 'sidebar', 'footer', 'header', 'ad', 'advertisement', 'sponsor', 'promo', 'related', 'share', 'social'];
  
  return excludeKeywords.some(keyword => 
    classList.includes(keyword) || id.includes(keyword)
  );
}

// Clean and normalize text
function cleanText(text) {
  if (!text) return '';
  
  return text
    .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Replace multiple newlines with double newline
    .trim();
}

// Extract image descriptions from alt text
function extractImageDescriptions() {
  const images = Array.from(document.querySelectorAll("img[alt]:not([alt=''])"));
  if (images.length === 0) return "";
  
  const descriptions = images
    .map(img => img.alt.trim())
    .filter(alt => alt.length > 5 && !alt.toLowerCase().includes('icon') && !alt.toLowerCase().includes('logo'))
    .map(alt => `• ${alt}`)
    .slice(0, 5); // Limit to 5 images to avoid too much noise
  
  return descriptions.length > 0 ? "Image Descriptions:\n" + descriptions.join("\n") : "";
}

// Special function to extract text from Medium articles
function extractMediumArticleText() {
  const extractedText = [];
  
  // Get the article title
  const title = document.querySelector('h1');
  if (title && title.innerText.trim()) {
    extractedText.push(`# ${title.innerText.trim()}\n`);
  }
  
  // Get the article content - Medium uses different selectors
  let contentFound = false;
  
  // Try section elements first (common in Medium articles)
  const sections = document.querySelectorAll('section');
  if (sections.length > 0) {
    // Find the section with the most paragraph elements - likely the main content
    let mainSection = null;
    let maxParagraphs = 0;
    
    sections.forEach(section => {
      const paragraphs = section.querySelectorAll('p');
      if (paragraphs.length > maxParagraphs) {
        maxParagraphs = paragraphs.length;
        mainSection = section;
      }
    });
    
    if (mainSection && maxParagraphs > 2) {
      contentFound = true;
      extractedText.push(mainSection.innerText);
    }
  }
  
  // If no content found in sections, try other Medium-specific selectors
  if (!contentFound) {
    const mediumSelectors = ['.article-body', '.story-body', '.postArticle-content', '[data-testid="storyContent"]'];
    
    for (const selector of mediumSelectors) {
      const articleBody = document.querySelector(selector);
      if (articleBody && articleBody.innerText.length > 100) {
        contentFound = true;
        extractedText.push(articleBody.innerText);
        break;
      }
    }
  }
  
  // If still no content, fall back to all paragraphs
  if (!contentFound) {
    const paragraphs = Array.from(document.querySelectorAll('p'));
    const meaningfulParagraphs = paragraphs.filter(p => p.innerText.trim().length > 30);
    
    if (meaningfulParagraphs.length > 0) {
      extractedText.push(meaningfulParagraphs.map(p => p.innerText).join('\n\n'));
    } else {
      // Last resort - try main element
      const mainElement = document.querySelector('main');
      if (mainElement && mainElement.innerText.length > 100) {
        extractedText.push(mainElement.innerText);
      } else {
        return "Could not extract content from this Medium article. The page structure may have changed.";
      }
    }
  }
  
  return extractedText.join('\n\n');
}

function isPDF() {
  return window.location.href.toLowerCase().endsWith('.pdf') || 
         document.contentType === 'application/pdf' ||
         document.querySelector('embed[type="application/pdf"]') !== null;
}

function extractPDFText() {
  // For embedded PDFs, try to extract text from the viewer
  const pdfText = [];
  
  // Try to find text in common PDF viewer elements
  const textLayers = document.querySelectorAll('.textLayer, .pdf-text-layer, .textLayer div');
  if (textLayers.length > 0) {
    textLayers.forEach(layer => {
      const text = layer.innerText || layer.textContent;
      if (text && text.trim().length > 0) {
        pdfText.push(text.trim());
      }
    });
    
    if (pdfText.length > 0) {
      return pdfText.join(' ').replace(/\s+/g, ' ');
    }
  }
  
  // Try other PDF-specific selectors
  const pdfViewers = document.querySelectorAll('#viewer, .pdfViewer, .pdf-viewer');
  pdfViewers.forEach(viewer => {
    const text = viewer.innerText || viewer.textContent;
    if (text && text.trim().length > 50) {
      pdfText.push(text.trim());
    }
  });
  
  if (pdfText.length > 0) {
    return pdfText.join(' ').replace(/\s+/g, ' ');
  }
  
  // If we can't extract text directly, inform the user
  return "This appears to be a PDF document. For best results with PDFs, please use the browser's built-in PDF viewer or try a different PDF viewing method. Some PDFs may not have extractable text (like scanned images).";
}