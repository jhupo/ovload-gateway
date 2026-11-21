"""Object storage and fault injection confined to ovload_storage_verify."""
import gzip
import hashlib
import json
import os
import subprocess
import threading
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from security_backup_fixture import S3, objects, lock

TOKEN = os.environ['OVLOAD_FIXTURE_TOKEN']
originals = {}


def sql(statement):
    result = subprocess.run(['docker', 'exec', '-i', 'ovload-test-postgres', 'sh', '-c',
                             'psql -t -A -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ovload_storage_verify'],
                            input=statement, text=True, capture_output=True, check=True)
    return result.stdout.strip()


class Control(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_POST(self):
        if self.headers.get('X-Fixture-Token') != TOKEN:
            self.send_error(403)
            return
        value = json.loads(self.rfile.read(int(self.headers.get('Content-Length', '0'))) or b'{}')
        result = {}
        if self.path == '/fixture/marker/create':
            sql("create table if not exists restore_verification_probe(id integer primary key,value text not null);insert into restore_verification_probe values(1,'before') on conflict(id) do update set value='before';")
        elif self.path == '/fixture/marker/change':
            sql("update restore_verification_probe set value='after' where id=1;")
        elif self.path == '/fixture/marker/read':
            result = {'value': sql('select value from restore_verification_probe where id=1;')}
        elif self.path in ['/fixture/corrupt', '/fixture/poison', '/fixture/repair']:
            backup_id = value['id']
            if not re.fullmatch(r'backup_[a-f0-9]{32}', backup_id):
                self.send_error(400)
                return
            key = sql(f"select object_key from backup_records where id='{backup_id}';")
            with lock:
                path = next(path for path in objects if path.endswith('/' + key))
                originals.setdefault(backup_id, objects[path])
                data, metadata = originals[backup_id]
                if self.path == '/fixture/corrupt':
                    objects[path] = (data[:-1] + bytes([data[-1] ^ 1]), metadata)
                else:
                    if self.path == '/fixture/poison':
                        data = gzip.compress(gzip.decompress(data) + b'\nSELECT 1/0;\n')
                    objects[path] = (data, metadata)
                    digest = hashlib.sha256(data).hexdigest()
                    sql(f"update backup_records set size_bytes={len(data)},sha256='{digest}' where id='{backup_id}';")
        elif self.path == '/fixture/objects':
            with lock:
                result = {'objects': [{'key': key, 'size': len(data)} for key, (data, _) in objects.items()]}
        else:
            self.send_error(404)
            return
        data = json.dumps(result).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == '__main__':
    threading.Thread(target=ThreadingHTTPServer(('172.24.0.1', 19093), Control).serve_forever, daemon=True).start()
    ThreadingHTTPServer(('172.24.0.1', 19092), S3).serve_forever()
