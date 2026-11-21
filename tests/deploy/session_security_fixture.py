"""Session clock controls restricted to the disposable verification database."""
import json
import os
import subprocess
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Control(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_POST(self):
        if self.headers.get('X-Fixture-Token') != os.environ['OVLOAD_FIXTURE_TOKEN']:
            self.send_error(403)
            return
        body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', '0'))))
        if self.path == '/policy-idle':
            minutes = int(body['minutes'])
            assert 0 <= minutes <= 43200
            sql = f"update authentication_security set policy=jsonb_set(policy,'{{accessTokenMinutes}}','{minutes}'),revision=revision+1 where singleton;"
        elif self.path in ['/expire-idle', '/expire-lifetime', '/expire-step-up']:
            session = str(uuid.UUID(body['session']))
            field = {
                '/expire-idle': "last_seen_at=clock_timestamp()-interval '2 days'",
                '/expire-lifetime': "created_at=least(created_at,clock_timestamp()-interval '2 days'),expires_at=clock_timestamp()-interval '1 second'",
                '/expire-step-up': 'step_up_at=null',
            }[self.path]
            sql = f"update identity_sessions set {field} where id='{session}' and not is_admin_key;"
        else:
            self.send_error(404)
            return
        subprocess.run([
            'docker', 'exec', '-i', 'ovload-test-postgres', 'sh', '-c',
            'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ovload_session_verify',
        ], input=sql, text=True, check=True, capture_output=True)
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{}')


if __name__ == '__main__':
    ThreadingHTTPServer(('172.24.0.1', 19096), Control).serve_forever()
