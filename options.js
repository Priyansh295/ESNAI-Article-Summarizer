document.addEventListener("DOMContentLoaded", () => {
  // Load saved API key if it exists
  chrome.storage.sync.get(["geminiApiKey"], (result) => {
    if (result.geminiApiKey) {
      document.getElementById("api-key").value = result.geminiApiKey;
    }
  });

  // Handle Enter key press
  document.getElementById("api-key").addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      document.getElementById("save-button").click();
    }
  });

  // Save API key when button is clicked
  document.getElementById("save-button").addEventListener("click", () => {
    const apiKey = document.getElementById("api-key").value.trim();

    if (apiKey) {
      // Basic validation - Gemini API keys typically start with "AIza"
      if (!apiKey.startsWith('AIza')) {
        alert('Warning: This doesn\'t look like a valid Gemini API key. Gemini API keys typically start with "AIza". Please verify your API key.');
        return;
      }

      chrome.storage.sync.set({ geminiApiKey: apiKey }, () => {
        const successMessage = document.getElementById("success-message");
        successMessage.style.display = "block";

        // Close the tab after a short delay to show the success message
        setTimeout(() => {
          // Try different methods to close the tab
          if (window.close) {
            window.close();
          }
          
          // For cases where window.close() doesn't work (like when opened programmatically)
          try {
            chrome.tabs.getCurrent((tab) => {
              if (tab && chrome.tabs.remove) {
                chrome.tabs.remove(tab.id);
              }
            });
          } catch (error) {
            // If all else fails, just redirect back to the extension
            console.log('Could not auto-close tab, user will need to close manually');
          }
        }, 2000);
      });
    } else {
      alert('Please enter a valid API key before saving.');
    }
  });
});