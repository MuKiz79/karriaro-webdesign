/**
 * Global Application State
 */
export const state = {
    mode: 'single',   // 'single' | 'batch' | 'scanner'
    aborted: false,
    user: null,        // Firebase Auth User
    lastResult: null   // Letztes Analyse-Ergebnis (für CRM-Save)
};
