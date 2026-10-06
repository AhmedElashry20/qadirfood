#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
سيرفر محلي للموقع التعريفي.

`index.html` شظية HTML بدون <!doctype> و<html> و<head> — لأن منصة الـ Artifact
تغلّفه بنفسها عند النشر. تقديمه من سيرفر ثابت مباشرةً يعطي مستنداً غير سليم،
فهذا السيرفر يغلّفه بالهيكل الصحيح وقت الطلب.

المصدر واحد: نفس الملف يُنشر كـ Artifact ويُقدَّم محلياً — بلا نسخة ثانية تتباعد
عن الأصل مع الوقت.

التشغيل:  python3 apps/landing/serve.py [PORT]
"""
import http.server
import pathlib
import socketserver
import sys

ROOT = pathlib.Path(__file__).parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5175

# هيكل مكافئ لما تضيفه منصة الـ Artifact: charset و viewport و reset صغير.
SKELETON = """<!doctype html>
<html lang="ar">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>
  :root {{
    color-scheme: light dark;
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }}
  body {{ margin: 0; font: 14px system-ui, sans-serif; }}
  img {{ max-width: 100%; }}
  [hidden] {{ display: none !important; }}
</style>
{fragment}
</head>
</html>
"""


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def do_GET(self):
        if self.path in ('/', '/index.html'):
            self._serve_page()
            return
        super().do_GET()

    def _serve_page(self):
        try:
            fragment = (ROOT / 'index.html').read_text(encoding='utf-8')
        except OSError as e:
            self.send_error(500, f'تعذّر قراءة index.html: {e}')
            return

        # الشظية تبدأ بـ <title> و<link> و<style> ثم المحتوى — كلها صالحة داخل
        # <head>، والمتصفح ينقل ما بعدها إلى <body> تلقائياً. نكتبها كما هي
        # بدل تقسيمها، فأي إعادة تنظيم للملف لا تكسر السيرفر.
        body = SKELETON.format(fragment=fragment).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        # بلا كاش: الصفحة تُعدَّل أثناء التطوير، والكاش يخفي التعديلات.
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        sys.stderr.write(f'  {fmt % args}\n')


class Server(socketserver.TCPServer):
    allow_reuse_address = True


if __name__ == '__main__':
    with Server(('127.0.0.1', PORT), Handler) as httpd:
        print(f'الموقع التعريفي على  http://localhost:{PORT}')
        print('للإيقاف: Ctrl+C')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nتوقف السيرفر.')
