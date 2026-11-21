"""SMTP, signed Alipay and audit fixtures bound only to the Docker test bridge."""
import base64
import json
import os
import socketserver
import subprocess
import tempfile
import threading
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qsl, urlsplit
from security_backup_fixture import S3

runtime = Path(os.environ['OVLOAD_SETTINGS_RUNTIME'])
private = json.loads((runtime / 'private.json').read_text())
orders, messages, audit_requests, requests = {}, [], [], []
lock = threading.Lock()


def signature(data):
    return base64.b64encode(subprocess.run(['openssl', 'dgst', '-sha256', '-sign', str(runtime / 'alipay.key')], input=data, check=True, capture_output=True).stdout).decode()


def canonical(fields, callback=False):
    return '&'.join(f'{key}={value}' for key, value in sorted(fields.items()) if value and key != 'sign' and (not callback or key != 'sign_type')).encode()


def verify(fields):
    with tempfile.NamedTemporaryFile() as file:
        file.write(base64.b64decode(fields['sign'])); file.flush()
        result = subprocess.run(['openssl', 'dgst', '-sha256', '-verify', str(runtime / 'merchant.pub'), '-signature', file.name], input=canonical(fields), capture_output=True)
        return result.returncode == 0


class HTTP(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def reply(self, value, code=200):
        body = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(code); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        path = urlsplit(self.path).path
        if path == '/gateway.do':
            fields = dict(parse_qsl(body.decode()))
            if not verify(fields):
                return self.reply({'error': 'bad request signature'}, 403)
            biz = json.loads(fields['biz_content']); oid = biz['out_trade_no']
            method = fields['method']; key = method.replace('.', '_') + '_response'
            with lock:
                requests.append({'method': method, 'id': oid, 'signatureVerified': True})
                if method == 'alipay.trade.precreate':
                    order = orders.setdefault(oid, {'out_trade_no': oid, 'total_amount': biz['total_amount'], 'trade_status': 'WAIT_BUYER_PAY', 'trade_no': '202611020000' + oid.replace('-', '')[:20]})
                    if order['total_amount'] != biz['total_amount']:
                        return self.reply({'error': 'conflicting amount'}, 409)
                    value = {'code': '10000', 'msg': 'Success', 'out_trade_no': oid, 'qr_code': 'https://qr.alipay.com/fixture-' + oid}
                elif method == 'alipay.trade.close':
                    order = orders.get(oid)
                    if order and order['trade_status'] == 'WAIT_BUYER_PAY':
                        order['trade_status'] = 'TRADE_CLOSED'
                        value = {'code': '10000', 'msg': 'Success', 'out_trade_no': oid}
                    else:
                        value = {'code': '40004', 'msg': 'Business failed', 'sub_code': 'ACQ.TRADE_STATUS_ERROR'}
                elif method == 'alipay.trade.query' and oid in orders:
                    value = {'code': '10000', 'msg': 'Success', **orders[oid]}
                else:
                    value = {'code': '40004', 'msg': 'Business failed', 'sub_code': 'ACQ.TRADE_NOT_EXIST'}
            raw = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()
            payload = b'{"' + key.encode() + b'":' + raw + b',"sign":' + json.dumps(signature(raw)).encode() + b'}'
            self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(payload))); self.end_headers(); self.wfile.write(payload)
            return
        if path.endswith('/systemone'):
            valid = self.headers.get('Authorization') == 'Bearer ' + private['auditKey']
            with lock:
                audit_requests.append({'authorized': valid, 'viaProxy': self.path.startswith('http://'), 'body': json.loads(body)})
            if not valid:
                return self.reply({'error': 'unauthorized'}, 401)
            value = json.loads(body)
            return self.reply({'answers': {name: {'type': 'noul', 'noul': 0.2 if name.startswith('rule') else 1.0} for name in value['questions']}})
        if self.headers.get('X-Fixture-Token') != private['fixtureToken']:
            return self.reply({}, 403)
        value = json.loads(body or b'{}')
        if path == '/control/pay':
            with lock:
                order = orders[value['id']]
                if value.get('settle', True):
                    order['trade_status'] = 'TRADE_SUCCESS'
                fields = {**order, 'trade_status': 'TRADE_SUCCESS', 'app_id': '2026110200000001', 'seller_id': '2088000000000001', 'sign_type': 'RSA2', 'notify_id': 'fixture-notification'}
                fields.update(value.get('overrides', {}))
            fields['sign'] = signature(canonical(fields, True))
            return self.reply(fields)
        if path == '/control/messages':
            with lock:
                return self.reply({'messages': messages, 'requests': requests, 'audit': audit_requests})
        if path == '/control/expire-order':
            import uuid
            oid = str(uuid.UUID(value['id']))
            sql = f"update payment_orders set expires_at=clock_timestamp()-interval '1 minute' where id='{oid}';"
            subprocess.run(['docker','exec','-i','ovload-test-postgres','sh','-c','psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ovload_settings_verify'], input=sql, text=True, capture_output=True, check=True)
            return self.reply({})
        self.reply({}, 404)


class SMTP(socketserver.StreamRequestHandler):
    def handle(self):
        self.connection.settimeout(30)
        def send(line):
            self.wfile.write(line.encode() + b'\r\n'); self.wfile.flush()
        send('220 fixture ESMTP')
        mail, recipients, authorized = '', [], False
        while True:
            line = self.rfile.readline(20000)
            if not line:
                return
            text = line.decode().strip(); command = text.split(' ', 1)[0].upper()
            if command in ['EHLO', 'HELO']:
                send('250-fixture'); send('250 AUTH PLAIN LOGIN')
            elif command == 'AUTH':
                parts = text.split(' ')
                if len(parts) > 2:
                    token = parts[2]
                else:
                    send('334 '); token = self.rfile.readline().decode().strip()
                raw = base64.b64decode(token).decode().split('\0')
                authorized = len(raw) == 3 and raw[-2:] == ['fixture', private['smtpPassword']]
                send('235 Authenticated' if authorized else '535 Bad credentials')
            elif command == 'MAIL':
                if not authorized:
                    send('530 Authentication required'); continue
                mail = text; recipients = []; send('250 OK')
            elif command == 'RCPT':
                recipients.append(text); send('250 OK')
            elif command == 'DATA':
                send('354 End with dot'); data = []
                while True:
                    part = self.rfile.readline(100000)
                    if part in (b'.\r\n', b''):
                        break
                    data.append(part[1:] if part.startswith(b'..') else part)
                from email.parser import BytesParser
                from email import policy
                parsed = BytesParser(policy=policy.default).parsebytes(b''.join(data))
                with lock:
                    messages.append({'subject': str(parsed['Subject']), 'to': str(parsed['To']), 'html': parsed.get_content(), 'authenticated': authorized})
                send('250 Queued')
            elif command == 'QUIT':
                send('221 Bye'); return
            else:
                send('250 OK')


if __name__ == '__main__':
    smtp = socketserver.ThreadingTCPServer(('172.24.0.1', 19582), SMTP)
    smtp.daemon_threads = True
    threading.Thread(target=smtp.serve_forever, daemon=True).start()
    threading.Thread(target=ThreadingHTTPServer(('172.24.0.1', 19583), S3).serve_forever, daemon=True).start()
    ThreadingHTTPServer(('172.24.0.1', 19581), HTTP).serve_forever()
