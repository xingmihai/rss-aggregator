// utils/fetch.js - 新增文件
const DEFAULT_UA = 'Mozilla/5.0 (compatible; RSS Aggregator/1.0)';
const FETCH_TIMEOUT = 12000;

/**
 * 通用 GET 请求封装
 * @param {string} url 
 * @param {Object} headers 
 * @param {number} timeout 
 * @returns {Promise<string>}
 */
async function $GET(url, headers = {}, timeout = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': DEFAULT_UA, ...headers },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
    return await res.text();
  } catch (error) {
    console.error('GET request failed:', error);
    throw error; // 向上抛出，让调用方决定是否处理
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 通用 POST 请求封装  
 * @param {string} url
 * @param {Object} data
 * @param {Object} headers
 * @param {number} timeout
 * @returns {Promise<any>}
 */
async function $POST(url, data, headers = {}, timeout = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': DEFAULT_UA,
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error('POST request failed:', error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = { $GET, $POST };
