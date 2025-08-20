// Configuration settings for AI Summary extension

const CONFIG = {
  // API settings
  api: {
    maxTextLength: 20000,
    temperature: 0.2,
    model: 'gemini-1.5-flash'
  },
  
  // Export settings
  export: {
    defaultTxtFilename: 'summary.txt',
    defaultMdFilename: 'summary.md'
  },
  
  // UI settings
  ui: {
    darkModeStorageKey: 'darkMode',
    copyButtonTimeout: 2000 // ms
  }
};