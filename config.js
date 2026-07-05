/**
 * Configuration Manager
 * Handles storing and retrieving the Google Apps Script Web App URL.
 */
const CONFIG_KEY = 'exam_quiz_config';

const config = {
  getAppUrl() {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.appUrl) {
          return parsed.appUrl;
        }
      } catch (e) {
        console.error("Error parsing saved config", e);
      }
    }
    // Return empty by default. The user will set this in the Settings tab.
    return '';
  },

  setAppUrl(url) {
    const data = { appUrl: url.trim() };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(data));
  },

  hasUrl() {
    const url = this.getAppUrl();
    return url && url.startsWith('http');
  }
};

export default config;
