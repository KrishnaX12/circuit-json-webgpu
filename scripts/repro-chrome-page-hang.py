"""Run with python3 scripts/repro-chrome-page-hang.py, then open printed URLs in Chrome.

Mirrors a pinned public tscircuit deployment, preserving its bundled PostHog SDK
and worker failure path. The patched mode changes only GPU device shutdown.
No package installation or README changes are needed. Watch terminal heartbeats
after clicking PCB: stopped ticks indicate a main-thread stall independently of
browser automation. This is an integration reproduction, not a library-only one.
"""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import urlopen
from urllib.parse import urlsplit, parse_qs
import hashlib
import json
import re
import time

HOST = "https://tscircuit-lu27teb83-tscircuit.vercel.app"
BOARD = "/seveibar/f1c100s-linux-dev-board"
PORT = 5211
html = urlopen(HOST + BOARD, timeout=30).read().decode()
asset = re.findall(r'<script[^>]+src="([^"]+)"', html)[-1]
main = urlopen(HOST + asset, timeout=30).read().decode()
assert hashlib.sha256(main.encode()).hexdigest() == (
    "ba794ff40cc67b59842389cff4111bee38faa99d66e33046f30276b0599d0831"
), "Pinned site bundle changed"

# Production skips PostHog and Sentry on localhost. Enable both equally in controls.
guard = ('typeof window<"u"&&!window.location.hostname.includes("localhost")'
         '&&!window.location.hostname.includes("127.0.0.1")&&')
assert main.count(guard) == 2
baseline = main.replace(guard, 'typeof window<"u"&&')
old = "this.context.unconfigure(),this.device.destroy(),this.circuit=void 0"
new = ("this.context.unconfigure(),this.device.queue.onSubmittedWorkDone()"
       ".then(()=>this.device.destroy(),()=>this.device.destroy()),this.circuit=void 0")
assert baseline.count(old) == 1
variants = {"baseline": baseline, "patched": baseline.replace(old, new)}
start = main.index("const C7n=(function(){")
end = main.index("var Mm=C7n;", start)
variants["no-posthog"] = (baseline[:start] +
    "const C7n={__loaded:true,init(){},capture(){},identify(){},captureException(){}};" +
    baseline[end:])
# Preserve PostHog initialization while leaving Sentry's localhost guard intact.
variants["no-sentry"] = main.replace(guard + "(Mm", 'typeof window<"u"&&(Mm')
assert baseline.count("Mm.__loaded||Mm.init(") == 2
variants["no-posthog-init"] = baseline.replace("Mm.__loaded||Mm.init(", "true||Mm.init(")
variants = {key: value.replace("var Mm=C7n;", "var Mm=C7n;window.__pcbProbePH=Mm;")
            for key, value in variants.items()}
probe = """<script>(()=>{
new Worker('/__probe-worker.js');
const mode=new URLSearchParams(location.search).get('mode')||'baseline';
let ticks=0;setInterval(()=>ticks++,100);
setInterval(()=>fetch('/__heartbeat',{method:'POST',body:JSON.stringify({mode,ticks,
hash:location.hash,posthogLoaded:window.__pcbProbePH?.__loaded,
webgpuError:document.querySelector('[data-pcb-renderer=webgpu]')?.dataset.webgpuError
})}).catch(()=>{}),500);
})()</script>"""
cache = {}


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == "/__heartbeat":
            data = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            # Avoid printing the unrelated renderer diagnostic: classify it only.
            data["gpuFailure"] = bool(data.pop("webgpuError", None))
            data["received"] = time.time()
            print(json.dumps(data), flush=True)
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == BOARD:
            data, mime = html.replace("</head>", probe + "</head>").encode(), "text/html"
        elif path == asset:
            # Keep the exact same module URL used by lazy imports; adding a query
            # here would execute the main module twice and invalidate the trial.
            query = parse_qs(urlsplit(self.headers.get("Referer", "")).query)
            mode = query.get("mode", ["baseline"])[0]
            if mode not in variants:
                self.send_error(400, "Unknown mode")
                return
            data, mime = variants[mode].encode(), "text/javascript"
        elif path == "/__probe-worker.js":
            data, mime = b"/* passive worker present in both controls */", "text/javascript"
        else:
            try:
                if self.path not in cache:
                    with urlopen(HOST + self.path, timeout=30) as response:
                        cache[self.path] = (response.read(), response.headers.get("Content-Type"))
                data, mime = cache[self.path]
            except Exception as error:
                self.send_error(502, str(error))
                return
        self.send_response(200)
        self.send_header("Content-Type", mime or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


for mode in variants:
    print(f"http://127.0.0.1:{PORT}{BOARD}?mode={mode}#files", flush=True)
ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
