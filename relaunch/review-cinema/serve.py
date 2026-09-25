"""Loopback-only preview; intercepts inquiry actions so tests never contact Formspree."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, unquote
import argparse, json
ROOT=Path(__file__).resolve().parents[1]/'site'
class Preview(SimpleHTTPRequestHandler):
    def translate_path(self,path):
        name=unquote(urlsplit(path).path).lstrip('/')
        target=(ROOT/name).resolve()
        if ROOT not in target.parents and target!=ROOT or any(p.startswith('.') for p in Path(name).parts):
            return str(ROOT/'__not_found__')
        if not target.exists() and target.with_suffix('.html').exists(): target=target.with_suffix('.html')
        return str(target)
    def do_GET(self):
        if urlsplit(self.path).path.rstrip('/') in ['/persoenliche-websites','/persoenliche-websites.html']:
            s=(ROOT/'persoenliche-websites.html').read_text()
            s=s.replace('action="https://formspree.io/f/mjggbdre"','action="/__preview-inquiry"')
            s=s.replace('<body class="pg-page">','<body class="pg-page"><div class="pg-internal-notice">Interne Vorschau · Nicht veröffentlicht · Formularversand wird simuliert</div>')
            s=s.replace('</body>', '<script>document.addEventListener("karriaro:inquiry-sent",()=>{document.getElementById("form-status").textContent="Vorschau erfolgreich geprüft. Keine Nachricht wurde versendet oder gespeichert.";});</script></body>')
            data=s.encode();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
        else: super().do_GET()
    def do_POST(self):
        if self.path!='/__preview-inquiry': self.send_error(404);return
        length=int(self.headers.get('Content-Length','0'))
        if length>50000:self.send_error(413);return
        self.rfile.read(length) # discarded immediately; no messages, storage or external requests
        data=json.dumps({'ok':True,'preview':True}).encode()
        self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    def end_headers(self):
        self.send_header('X-Robots-Tag','noindex, nofollow');self.send_header('Cache-Control','no-store');super().end_headers()
    def log_message(self,*args): pass
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=4330);args=parser.parse_args()
    print(f'Internal gallery: http://127.0.0.1:{args.port}/persoenliche-websites',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),Preview).serve_forever()
