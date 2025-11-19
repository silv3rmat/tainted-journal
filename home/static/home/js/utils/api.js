// API utility functions for location detail page

export const getCookie = (name) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return 'Anonymous';
};

export const getCSRFToken = () => {
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'csrftoken') return value;
    }
    return '';
};

export const fetchLocationData = async (locationId) => {
    try {
        const response = await fetch(`/api/location/${locationId}/`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching location data:', error);
        throw error;
    }
};

export const linkifyText = (text) => {
    const escapeHtml = (str) => {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    };
    
    let escaped = escapeHtml(text);
    
    escaped = escaped.replace(/#(\d+)/g, (match, number) => {
        return `<a href="/location/${number}/" class="note-link">#${number}</a>`;
    });
    
    escaped = escaped.replace(/\(([^)]+)\)/g, (match, name) => {
        return `<span class="note-link">(${name})</span>`;
    });
    
    return escaped;
};

