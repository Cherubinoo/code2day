import { getCsrfToken } from './appUtils';

const BASE_URL = '/api';
const DEFAULT_TIMEOUT = 60000; // 60 seconds for code execution

/**
 * Fetch with timeout support
 */
async function fetchWithTimeout(url, options = {}, timeout = DEFAULT_TIMEOUT) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeout}ms. The server took too long to respond.`);
        }
        throw error;
    }
}

const api = {
    async get(url) {
        try {
            const response = await fetchWithTimeout(`${BASE_URL}${url}`, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json',
                },
            }, DEFAULT_TIMEOUT);
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw { response: { data: error }, message: response.statusText, status: response.status };
            }
            return { data: await response.json() };
        } catch (error) {
            if (error instanceof TypeError && error.message === 'Failed to fetch') {
                throw { 
                    response: { data: { detail: 'Network error. Please check your connection.' } }, 
                    message: 'Failed to fetch',
                    status: 0
                };
            }
            throw error;
        }
    },

    async post(url, data) {
        try {
            const response = await fetchWithTimeout(`${BASE_URL}${url}`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken(),
                },
                body: JSON.stringify(data),
            }, DEFAULT_TIMEOUT);
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw { response: { data: error }, message: response.statusText, status: response.status };
            }
            return { data: await response.json() };
        } catch (error) {
            if (error instanceof TypeError && error.message === 'Failed to fetch') {
                throw { 
                    response: { data: { detail: 'Network error. Please check your connection.' } }, 
                    message: 'Failed to fetch',
                    status: 0
                };
            }
            throw error;
        }
    },

    async patch(url, data) {
        try {
            const response = await fetchWithTimeout(`${BASE_URL}${url}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken(),
                },
                body: JSON.stringify(data),
            }, DEFAULT_TIMEOUT);
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw { response: { data: error }, message: response.statusText, status: response.status };
            }
            return { data: await response.json() };
        } catch (error) {
            if (error instanceof TypeError && error.message === 'Failed to fetch') {
                throw { 
                    response: { data: { detail: 'Network error. Please check your connection.' } }, 
                    message: 'Failed to fetch',
                    status: 0
                };
            }
            throw error;
        }
    },

    async delete(url) {
        try {
            const response = await fetchWithTimeout(`${BASE_URL}${url}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: {
                    'X-CSRFToken': getCsrfToken(),
                },
            }, DEFAULT_TIMEOUT);
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw { response: { data: error }, message: response.statusText, status: response.status };
            }
            return { data: await response.json() };
        } catch (error) {
            if (error instanceof TypeError && error.message === 'Failed to fetch') {
                throw { 
                    response: { data: { detail: 'Network error. Please check your connection.' } }, 
                    message: 'Failed to fetch',
                    status: 0
                };
            }
            throw error;
        }
    }
};

export default api;
