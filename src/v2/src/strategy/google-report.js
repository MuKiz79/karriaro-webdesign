/**
 * Google-Perspektive-Report — Core Web Vitals in Googles Sprache
 */

export function generateGoogleReport(ws) {
    const lcpSec = parseFloat(ws.lcp) || 0;
    const clsVal = parseFloat(ws.cls) || 0;
    const fcpSec = parseFloat(ws.fcp) || 0;

    const cwv = [
        { name: 'Largest Contentful Paint (LCP)', value: ws.lcp, pass: lcpSec <= 2.5, threshold: '≤ 2,5s' },
        { name: 'Cumulative Layout Shift (CLS)', value: ws.cls, pass: clsVal <= 0.1, threshold: '≤ 0,1' },
        { name: 'First Contentful Paint (FCP)', value: ws.fcp, pass: fcpSec <= 1.8, threshold: '≤ 1,8s' },
        { name: 'HTTPS', value: ws.isHttps ? 'Aktiv' : 'Fehlt', pass: ws.isHttps, threshold: 'Erforderlich' },
        { name: 'Mobile Viewport', value: ws.viewport ? 'OK' : 'Fehlt', pass: ws.viewport, threshold: 'Erforderlich' },
        { name: 'Barrierefreiheit (BFSG)', value: ws.a11y + '/100', pass: ws.a11y >= 80, threshold: '≥ 80' }
    ];

    return { cwv, passed: cwv.filter(c => c.pass).length, failed: cwv.filter(c => !c.pass).length, total: cwv.length };
}
