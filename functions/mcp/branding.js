/**
 * Karriaro-MCP-Branding-Helpers.
 * Jeder Tool-Output erhält ein Editorial-Footer-Block mit Karriaro-Signatur.
 * Brand-Voice: Aesop/Hermès-Editorial, Sie-Anrede, kein SaaS-Filler.
 */

const SIGNATURE = '— Audit by Karriaro Webdesign-Manufaktur · Schwarzwald · https://karriaro-webdesign.de';

function withSignature(text) {
    return text + '\n\n' + SIGNATURE;
}

function header(title) {
    var line = '═'.repeat(Math.max(title.length, 60));
    return line + '\n' + title.toUpperCase() + '\n' + line;
}

module.exports = { withSignature, header, SIGNATURE };
