import { getCsrfToken } from './appUtils';

const BASE_URL = '/api';
const DEFAULT_TIMEOUT = 60000; // 60 seconds for code execution

// A handful of admin bulk-action endpoints (Problem Bank's generate/
// validate-generic-schemas, per-topic migration, fill-missing) are
// deliberately time-budgeted server-side for up to 90s per click
// (matching gunicorn's ~120s worker timeout) — pass this as
// `api.post(url, data, { timeout: LONG_RUNNING_TIMEOUT })` for any call
// into one of those, or the client aborts (and shows a scary "network
// error") well before the server was ever going to finish, even though
// the server keeps working and may still save progress regardless.
export const LONG_RUNNING_TIMEOUT = 100000; // 100 seconds

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

    async post(url, data, { timeout = DEFAULT_TIMEOUT } = {}) {
        const isFormData = data instanceof FormData;
        try {
            const headers = {
                'X-CSRFToken': getCsrfToken(),
            };
            if (!isFormData) {
                headers['Content-Type'] = 'application/json';
            }

            const response = await fetchWithTimeout(`${BASE_URL}${url}`, {
                method: 'POST',
                credentials: 'include',
                headers,
                body: isFormData ? data : JSON.stringify(data),
            }, timeout);
            
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
        const isFormData = data instanceof FormData;
        try {
            const headers = {
                'X-CSRFToken': getCsrfToken(),
            };
            // Don't set Content-Type for FormData — browser sets it with boundary automatically
            if (!isFormData) {
                headers['Content-Type'] = 'application/json';
            }

            const response = await fetchWithTimeout(`${BASE_URL}${url}`, {
                method: 'PATCH',
                credentials: 'include',
                headers,
                body: isFormData ? data : JSON.stringify(data),
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

    async put(url, data) {
        const isFormData = data instanceof FormData;
        try {
            const headers = {
                'X-CSRFToken': getCsrfToken(),
            };
            if (!isFormData) {
                headers['Content-Type'] = 'application/json';
            }

            const response = await fetchWithTimeout(`${BASE_URL}${url}`, {
                method: 'PUT',
                credentials: 'include',
                headers,
                body: isFormData ? data : JSON.stringify(data),
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
    },

    /**
     * GET a binary/blob response (e.g. PDF, image).
     * Returns { data: Blob }.
     */
    async getBlob(url) {
        try {
            const response = await fetchWithTimeout(`${BASE_URL}${url}`, {
                method: 'GET',
                credentials: 'include',
            }, DEFAULT_TIMEOUT);

            if (!response.ok) {
                // Try to read error as text (might be JSON or plain text)
                const errText = await response.text().catch(() => response.statusText);
                let errData = {};
                try { errData = JSON.parse(errText); } catch (_) { errData = { detail: errText }; }
                throw { response: { data: errData }, message: response.statusText, status: response.status };
            }

            const blob = await response.blob();
            return { data: blob };
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
