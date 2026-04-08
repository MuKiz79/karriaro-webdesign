/**
 * App Configuration + User Profile (SuperPrompt)
 * Persisted in localStorage
 */
export const config = {
    psiKey: '',
    fnUrl: '',

    // SuperPrompt: Wer bin ich und was kann ich?
    profile: {
        name: '',
        company: '',
        role: '',           // z.B. "Gründer & Webdesigner"
        services: '',       // z.B. "Handcodierte Websites, SEO, BFSG-Compliance"
        priceRange: '',     // z.B. "990-1.990€"
        targetGroup: '',    // z.B. "Lokale Unternehmen (Handwerk, Gastronomie, Ärzte)"
        usp: '',            // z.B. "Kein Baukasten, kein Abo. Handcodiert, in 2 Wochen fertig."
        location: '',       // z.B. "Schwarzwald / Ortenau"
        portfolio: '',      // z.B. "karriaro-webdesign.de, Spedition Kolbe"
        tone: 'professionell'  // professionell | freundlich | direkt
    }
};

export function loadConfig() {
    config.psiKey = localStorage.getItem('karriaro_psi_key') || '';
    config.fnUrl = localStorage.getItem('karriaro_fn_url') || '';

    // Profil laden
    const saved = localStorage.getItem('karriaro_profile');
    if (saved) {
        try { Object.assign(config.profile, JSON.parse(saved)); } catch(e) {}
    }
}

export function saveConfig() {
    localStorage.setItem('karriaro_psi_key', config.psiKey);
    localStorage.setItem('karriaro_fn_url', config.fnUrl);
    localStorage.setItem('karriaro_profile', JSON.stringify(config.profile));
}
