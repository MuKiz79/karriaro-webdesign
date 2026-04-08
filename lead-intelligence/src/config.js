/**
 * App Configuration — persisted in localStorage
 */
export const config = {
    psiKey: '',
    fnUrl: ''
};

export function loadConfig() {
    config.psiKey = localStorage.getItem('karriaro_psi_key') || '';
    config.fnUrl = localStorage.getItem('karriaro_fn_url') || '';
}

export function saveConfig() {
    localStorage.setItem('karriaro_psi_key', config.psiKey);
    localStorage.setItem('karriaro_fn_url', config.fnUrl);
}
