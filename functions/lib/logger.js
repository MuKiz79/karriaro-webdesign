/**
 * Sprint 82 — Strukturiertes Cloud-Logging.
 *
 * Cloud Logging parsed JSON-Output auf stdout/stderr und macht die Felder
 * als Filter/Label verfuegbar. Mit `console.log("...")` gibt es nur den
 * "textPayload" und keine strukturierten Felder fuer Filter/Alerts.
 *
 * Severity-Levels nach Cloud-Logging-Konvention:
 *   DEBUG, INFO, NOTICE, WARNING, ERROR, CRITICAL, ALERT, EMERGENCY
 */

function emit(severity, message, context) {
    const entry = {
        severity,
        message,
        ...context,
        timestamp: new Date().toISOString()
    };
    const line = JSON.stringify(entry);
    if (severity === 'ERROR' || severity === 'CRITICAL' || severity === 'ALERT' || severity === 'EMERGENCY') {
        process.stderr.write(line + '\n');
    } else {
        process.stdout.write(line + '\n');
    }
}

module.exports = {
    debug:    (message, context = {}) => emit('DEBUG',    message, context),
    info:     (message, context = {}) => emit('INFO',     message, context),
    notice:   (message, context = {}) => emit('NOTICE',   message, context),
    warn:     (message, context = {}) => emit('WARNING',  message, context),
    error:    (message, context = {}) => emit('ERROR',    message, context),
    critical: (message, context = {}) => emit('CRITICAL', message, context)
};
