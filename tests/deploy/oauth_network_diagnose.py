"""Probe OAuth HTTP behavior with deliberately invalid test inputs, never user codes."""
import json
import re
import subprocess

for route, proxy in [('direct', []), ('authorized-local-proxy', ['--proxy', 'socks5h://192.168.2.85:12334'])]:
    command = ['curl', '-sS', '--connect-timeout', '10', '--max-time', '25', '-A', '',
        '-H', 'Accept: application/json', '-w', '\n%{http_code}\n%{content_type}',
        '--data-urlencode', 'grant_type=authorization_code',
        '--data-urlencode', 'client_id=app_EMoamEEZ73f0CkXaXp7hrann',
        '--data-urlencode', 'code=ovload-invalid-diagnostic-code',
        '--data-urlencode', 'code_verifier=ovload-diagnostic-verifier-not-a-user-credential',
        '--data-urlencode', 'redirect_uri=http://127.0.0.1:1455/auth/callback',
        *proxy, 'https://auth.openai.com/oauth/token']
    result = subprocess.run(command, capture_output=True, text=True)
    parts = result.stdout.rsplit('\n', 2)
    info = {'route': route, 'exit': result.returncode}
    if len(parts) == 3:
        body, status, content_type = parts
        info.update(status=status, contentType=content_type)
        try:
            data = json.loads(body)
            error = data.get('error')
            code = error.get('code', error.get('type')) if isinstance(error, dict) else error
            if isinstance(code, str) and re.fullmatch(r'[a-zA-Z0-9_.-]{1,100}', code):
                info['errorCode'] = code
        except (ValueError, AttributeError):
            info['json'] = False
            info['challenge'] = 'Just a moment' in body or 'cf-chl' in body
    print(json.dumps(info), flush=True)
