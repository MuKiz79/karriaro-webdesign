/**
 * Global Application State
 */
export const state = {
    mode: 'single',   // 'single' | 'batch' | 'scanner' (Such-Methode unter "Finden")
    view: 'finden',   // 'finden' | 'pipeline' | 'outreach' | 'einstellungen' (Workflow-Ebene)
    aborted: false,
    user: null,        // Firebase Auth User
    lastResult: null   // Letztes Analyse-Ergebnis (für CRM-Save)
};
