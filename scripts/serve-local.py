"""Local preview with read-only study API proxy (avoids localhost CORS failures).

Run: py -3 scripts/serve-local.py --port 8124
Only the served app.js gets a local API URL; production files stay unchanged.
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError,URLError
from urllib.parse import urlsplit,unquote
from urllib.request import urlopen

API='http://api-node.acpv.local/dev/v1/design-explorer'
ROOT=Path(__file__).resolve().parents[1]

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path=urlsplit(self.path).path
        if path.startswith('/_study-api/projects/'):
            if '..' in unquote(path).split('/'):
                self.send_error(400);return
            try:
                with urlopen(API+self.path[len('/_study-api'):],timeout=30) as response:
                    data=response.read()
                    self.send_response(response.status)
                    self.send_header('Content-Type',response.headers.get('Content-Type','application/octet-stream'))
                    self.send_header('Content-Length',str(len(data)))
                    self.end_headers();self.wfile.write(data)
            except HTTPError as error:self.send_error(error.code)
            except URLError:self.send_error(502,'Study API unavailable')
            return
        if path=='/v2/app.js':
            data=(ROOT/'v2/app.js').read_text(encoding='utf-8').replace(API,'/_study-api').encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type','text/javascript; charset=utf-8')
            self.send_header('Cache-Control','no-store')
            self.send_header('Content-Length',str(len(data)))
            self.end_headers();self.wfile.write(data)
            return
        super().do_GET()

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,default=8124)
    args=parser.parse_args()
    ThreadingHTTPServer(('127.0.0.1',args.port),partial(Handler,directory=str(ROOT))).serve_forever()
