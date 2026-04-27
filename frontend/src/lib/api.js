import { getCsrfToken } from './appUtils';

const BASE_URL = '/api';

const api = {
    async get(url) {
        const response = await fetch(`${BASE_URL}${url}`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
            },
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw { response: { data: error }, message: response.statusText };
        }
        return { data: await response.json() };
    },

    async post(url, data) {
        const response = await fetch(`${BASE_URL}${url}`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken(),
            },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw { response: { data: error }, message: response.statusText };
        }
        return { data: await response.json() };
    },

    async patch(url, data) {
        const response = await fetch(`${BASE_URL}${url}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken(),
            },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw { response: { data: error }, message: response.statusText };
        }
        return { data: await response.json() };
    },

    async delete(url) {
        const response = await fetch(`${BASE_URL}${url}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: {
                'X-CSRFToken': getCsrfToken(),
            },
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw { response: { data: error }, message: response.statusText };
        }
        return { data: await response.json() };
    }
};

export default api;
