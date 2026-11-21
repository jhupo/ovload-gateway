"""Local Jev stub and clock fixture, restricted to the disposable verification DB."""
import json
import hashlib
import os
import subprocess
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ['OVLOAD_FIXTURE_TOKEN']


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def reply(self, status, body):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        length = int(self.headers.get('Content-Length', '0'))
        if length > 2_000_000:
            return self.reply(413, {})
        value = json.loads(self.rfile.read(length) or b'{}')
        if self.path == '/fixture/challenge':
            if self.headers.get('X-Fixture-Token') != TOKEN:
                return self.reply(403, {})
            challenge = str(uuid.UUID(value['id']))
            answer = 'ABC123'
            digest = hashlib.sha256(f'{challenge}:{answer}'.encode()).hexdigest()
            sql = f"update lottery_challenges set answer_digest=decode('{digest}','hex') where id='{challenge}';"
            subprocess.run(['docker', 'exec', '-i', 'ovload-test-postgres', 'sh', '-c',
                            'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ovload_engagement_verify'],
                           input=sql.encode(), check=True, stdout=subprocess.DEVNULL)
            return self.reply(200, {'answer': answer})
        if self.path == '/fixture/release':
            if self.headers.get('X-Fixture-Token') != TOKEN:
                return self.reply(403, {})
            sql = """begin;
                alter table referral_rebates disable trigger referral_rebates_immutable;
                update referral_rebates set available_at=clock_timestamp()-interval '1 second'
                where invitee_id in(select id from identity_users where email like 'engagement-%@example.com');
                alter table referral_rebates enable trigger referral_rebates_immutable;
                commit;"""
            subprocess.run(['docker', 'exec', '-i', 'ovload-test-postgres', 'sh', '-c',
                            'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ovload_engagement_verify'],
                           input=sql.encode(), check=True, stdout=subprocess.DEVNULL)
            return self.reply(200, {'released': True})
        if self.path.startswith('/fail/'):
            return self.reply(503, {'error': 'local failure fixture'})
        if self.path.endswith('/v1/systemone'):
            state = value.get('state', '')
            answers = {key: {'type': 'noul', 'noul': 'invalid' if 'malformed' in state else
                            0.99 if 'api_hit' in state else 0.01} for key in value['questions']}
            return self.reply(200, {'model': 'jev-latest', 'answers': answers})
        return self.reply(404, {})


ThreadingHTTPServer(('172.24.0.1', 19091), Handler).serve_forever()
