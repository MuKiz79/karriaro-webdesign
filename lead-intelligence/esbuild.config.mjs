import { build, context } from 'esbuild';
import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const isWatch = process.argv.includes('--watch');

// JS Bundle
const jsConfig = {
    entryPoints: ['src/main.js'],
    bundle: true,
    outfile: 'dist/app.js',
    format: 'esm',
    target: 'es2022',
    minify: !isWatch,
    sourcemap: isWatch,
    external: [
        'https://www.gstatic.com/firebasejs/*'  // Firebase CDN bleibt extern
    ]
};

// CSS: Concatenate alle CSS-Dateien in Reihenfolge
async function buildCSS() {
    const cssDir = 'src/styles';
    const order = ['base.css', 'nav.css', 'hero.css', 'cards.css', 'probability.css', 'tables.css', 'crm.css', 'science.css', 'responsive.css'];
    let css = '';
    for (const file of order) {
        try {
            css += await readFile(join(cssDir, file), 'utf-8') + '\n';
        } catch (e) { /* File not yet created */ }
    }
    await writeFile('dist/app.css', css);
}

// HTML: Kopiere index.html
async function copyHTML() {
    try {
        const html = await readFile('index.html', 'utf-8');
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
    } else {
        await build(jsConfig);
        await buildCSS();
        await copyHTML();
        console.timeEnd('Build');
        console.log('✓ dist/app.js + dist/app.css + dist/index.html');
    }
}

run().catch(e => { console.error(e); process.exit(1); });
