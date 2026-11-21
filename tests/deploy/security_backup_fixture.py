"""Disposable S3 protocol fixture; only bind to the Docker verification network."""
import hashlib
import json
import threading
import uuid
import os
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs, unquote
from xml.sax.saxutils import escape

objects, uploads = {}, {}
lock = threading.Lock()

class S3(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def reply(self, status=200, body=b'', headers=None):
        self.send_response(status)
        for k,v in (headers or {}).items(): self.send_header(k,str(v))
        self.send_header('Content-Length',str(len(body))); self.end_headers()
        if self.command!='HEAD': self.wfile.write(body)
    def handle_request(self):
        url=urlsplit(self.path);key=unquote(url.path);q=parse_qs(url.query,keep_blank_values=True)
        length=int(self.headers.get('Content-Length','0')); body=self.rfile.read(length)
        if 'aws-chunked' in self.headers.get('Content-Encoding',''):
            decoded=bytearray(); rest=body
            while rest:
                line,rest=rest.split(b'\r\n',1); size=int(line.split(b';')[0],16)
                if size==0:break
                decoded.extend(rest[:size]); rest=rest[size+2:]
            body=bytes(decoded)
        metadata={k:v for k,v in self.headers.items() if k.lower().startswith('x-amz-meta-')}
        if key=='/health':return self.reply(body=b'OK')
        with lock:
            if self.command=='POST' and 'uploads' in q:
                uid=str(uuid.uuid4());uploads[uid]={'key':key,'metadata':metadata,'parts':{}}
                return self.reply(body=f'<InitiateMultipartUploadResult><Bucket>verification</Bucket><Key>{escape(key)}</Key><UploadId>{uid}</UploadId></InitiateMultipartUploadResult>'.encode())
            if 'uploadId' in q:
                uid=q['uploadId'][0];upload=uploads.get(uid)
                if upload is None:return self.reply(404)
                if self.command=='PUT':
                    upload['parts'][int(q['partNumber'][0])]=body
                    return self.reply(headers={'ETag':'"'+hashlib.md5(body).hexdigest()+'"'})
                if self.command=='DELETE':uploads.pop(uid,None);return self.reply(204)
                if self.command=='POST':
                    data=b''.join(v for _,v in sorted(upload['parts'].items()));objects[key]=(data,upload['metadata']);uploads.pop(uid)
                    return self.reply(body=f'<CompleteMultipartUploadResult><Bucket>verification</Bucket><Key>{escape(key)}</Key><ETag>"{hashlib.md5(data).hexdigest()}"</ETag></CompleteMultipartUploadResult>'.encode())
            if self.command=='PUT':objects[key]=(body,metadata);return self.reply(headers={'ETag':'"'+hashlib.md5(body).hexdigest()+'"'})
            if self.command=='DELETE':objects.pop(key,None);return self.reply(204)
            if key not in objects:return self.reply(404,body=b'<Error><Code>NoSuchKey</Code></Error>')
            data,meta=objects[key]
            return self.reply(body=data,headers={**meta,'ETag':'"'+hashlib.md5(data).hexdigest()+'"','Content-Type':'application/octet-stream'})
    do_GET=do_HEAD=do_POST=do_PUT=do_DELETE=handle_request

class Control(BaseHTTPRequestHandler):
    def log_message(self,*_):pass
    def do_POST(self):
        if self.path not in ['/expire-step-up','/expire-idle','/expire-lifetime','/due-backup'] or self.headers.get('X-Fixture-Token')!=os.environ['OVLOAD_FIXTURE_TOKEN']:
            self.send_error(403);return
        if self.path=='/due-backup':sql="update backup_settings set next_run_at=clock_timestamp()-interval '1 minute' where id=1 and schedule_enabled;"
        else:
            field={'/expire-step-up':'step_up_at=null','/expire-idle':"last_seen_at=clock_timestamp()-interval '1 day'",'/expire-lifetime':"created_at=least(created_at,clock_timestamp()-interval '2 days'),expires_at=clock_timestamp()-interval '1 second'"}[self.path]
            sql="update identity_sessions set "+field+" where principal_id=(select id from identity_management_principals where username='ovload_security_verify') and not is_admin_key;"
        subprocess.run(['docker','exec','-i','ovload-test-postgres','sh','-c','psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ovload_security_verify'],input=sql,text=True,check=True,capture_output=True)
        self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{}')

if __name__=='__main__':
    threading.Thread(target=ThreadingHTTPServer(('172.24.0.1',19093),Control).serve_forever,daemon=True).start()
    ThreadingHTTPServer(('172.24.0.1',19092),S3).serve_forever()
