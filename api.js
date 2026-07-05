import config from './config.js';

export class ApiError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Perform a request to the Google Apps Script Web App API
 * @param {string} action 
 * @param {'GET'|'POST'} method 
 * @param {object|null} data 
 * @returns {Promise<any>}
 */
async function request(action, method = 'GET', data = null) {
  if (!config.hasUrl()) {
    throw new ApiError('Google Apps Script URL is not configured. Please enter it in Settings.');
  }

  const url = config.getAppUrl();
  let fetchUrl = url;
  
  const options = {
    method: method,
    redirect: 'follow', // GAS requires redirect following
  };

  if (method === 'GET') {
    const separator = url.includes('?') ? '&' : '?';
    fetchUrl = `${url}${separator}action=${action}`;
  } else if (method === 'POST') {
    // We send payload as text/plain to avoid pre-flight CORS preflight requests
    options.headers = {
      'Content-Type': 'text/plain;charset=utf-8'
    };
    options.body = JSON.stringify({
      action: action,
      ...data
    });
  }

  try {
    const response = await fetch(fetchUrl, options);
    if (!response.ok) {
      throw new ApiError(`HTTP Error: ${response.status} ${response.statusText}`);
    }
    const result = await response.json();
    if (!result.success) {
      throw new ApiError(result.error || 'Server reported failure.');
    }
    return result.data;
  } catch (error) {
    console.error(`API Call failed [${action}]:`, error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(`Network/CORS error: ${error.message || 'Connection failed.'}`);
  }
}

export const api = {
  // GET requests
  getQuestions: () => request('getQuestions', 'GET'),
  getState: () => request('getState', 'GET'),
  getHistory: () => request('getHistory', 'GET'),

  // POST requests
  addQuestion: (qData) => request('addQuestion', 'POST', qData),
  updateQuestion: (qData) => request('updateQuestion', 'POST', qData),
  deleteQuestion: (id) => request('deleteQuestion', 'POST', { id }),
  logHistory: (logData) => request('logHistory', 'POST', logData),
  updateState: (stateData) => request('updateState', 'POST', stateData),
  resetRound: (stateData) => request('resetRound', 'POST', stateData)
};
export default api;
