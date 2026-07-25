import { build, context } from 'esbuild';
import { readdir, readFile, writeFile, mkdir, copyFile } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';

const isWatch = process.argv.includes('--watch');

// JS Bundle
const jsConfig = {
    entryPoints: ['src/main.js'],
    bundle: true,
    outfile: 'dist/app.js',
    format: 'iife',       // IIFE statt ESM — vermeidet TDZ-Probleme bei zirkulären Lazy-Inits
    target: 'es2020',
    minify: !isWatch,
    sourcemap: isWatch,
    external: [
        'https://www.gstatic.com/firebasejs/*'  // Firebase CDN bleibt extern
    ]
};

// CSS: Concatenate alle CSS-Dateien in Reihenfolge
async function buildCSS() {
    const cssDir = 'src/styles';
    // fonts.css zuerst (@font-face vor Nutzung). brand.css NACH den Komponenten-
    // Styles (überschreibt .hero h1 etc.), aber vor responsive.css (Mobile gewinnt).
    const order = ['fonts.css', 'base.css', 'nav.css', 'hero.css', 'cards.css', 'probability.css', 'tables.css', 'crm.css', 'outreach.css', 'science.css', 'brand.css', 'responsive.css'];
    let css = '';
    for (const file of order) {
        try {
            css += await readFile(join(cssDir, file), 'utf-8') + '\n';
        } catch (e) { /* File not yet created */ }
    }
    await writeFile('dist/app.css', css);
}

// Fonts: woff2 nach dist/fonts/ kopieren (von fonts.css relativ referenziert)
async function copyFonts() {
    try {
        const src = 'src/fonts';
        await mkdir('dist/fonts', { recursive: true });
        const files = (await readdir(src)).filter(f => f.endsWith('.woff2'));
        await Promise.all(files.map(f => copyFile(join(src, f), join('dist/fonts', f))));
    } catch (e) { /* keine Fonts → CSS fällt auf System-Stack zurück */ }
}

// HTML: Kopiere index.html + Content-Hash-Cache-Bust.
// KRITISCH: app.js/app.css werden von firebase.json als `immutable, max-age=1yr`
// ausgeliefert. Ohne versionierte URL bekommt JEDER wiederkehrende Besucher das
// ALTE Bundle (Deploys bleiben unsichtbar). Ein Content-Hash an den Refs erzeugt
// eine neue URL nur bei echter Aenderung — No-Op-Builds behalten den Cache.
async function copyHTML() {
    try {
        // Versicherung: falls die Source-Referenz je wieder auf src/main.js zeigt,
        // im dist-Output auf das gebündelte app.js umschreiben (dist hat kein src/).
        let hash = 'dev';
        try {
            const [js, css] = await Promise.all([
                readFile('dist/app.js', 'utf-8'),
                readFile('dist/app.css', 'utf-8').catch(() => '')
            ]);
            hash = createHash('sha256').update(js).update(css).digest('hex').slice(0, 10);
        } catch (e) { /* Hash optional — schlimmstenfalls kein Bust */ }

        const html = (await readFile('index.html', 'utf-8'))
            .replace(/src=["']src\/main\.js["']/, 'src="app.js"')
            .replace(/src=["']app\.js(\?[^"']*)?["']/, `src="app.js?v=${hash}"`)
            .replace(/href=["']app\.css(\?[^"']*)?["']/, `href="app.css?v=${hash}"`);
        await writeFile('dist/index.html', html);
    } catch (e) { console.error('HTML copy failed:', e.message); }
}

async function run() {
    console.time('Build');

    if (isWatch) {
        const ctx = await context(jsConfig);
        await ctx.watch();
        console.log('Watching for changes...');
        // Initial build
        await buildCSS();
        await copyHTML();
        await copyFonts();
    } else {
        await build(jsConfig);
        await buildCSS();
        await copyHTML();
        await copyFonts();
        console.timeEnd('Build');
        console.log('✓ dist/app.js + dist/app.css + dist/index.html');
    }
}

run().catch(e => { console.error(e); process.exit(1); });
