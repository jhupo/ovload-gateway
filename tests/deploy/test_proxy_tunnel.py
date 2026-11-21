"""Temporarily expose the authorized local test proxy through SSH loopback."""
import os
import select
import socket
import threading
from pathlib import Path

import paramiko


def relay(channel):
    local = socket.create_connection(("127.0.0.1", 12334), timeout=15)
    try:
        while True:
            ready, _, _ = select.select([channel, local], [], [], 30)
            for source in ready:
                data = source.recv(65536)
                if not data:
                    return
                (local if source is channel else channel).sendall(data)
    finally:
        channel.close()
        local.close()


client = paramiko.SSHClient()
client.load_host_keys(str(Path.home() / ".ssh/known_hosts"))
client.set_missing_host_key_policy(paramiko.RejectPolicy())
client.connect("192.168.2.150", username="root",
               password=os.environ["OVLOAD_TEST_SSH_PASSWORD"], timeout=20)
transport = client.get_transport()
transport.set_keepalive(15)
transport.request_port_forward("127.0.0.1", 22334)
print("Temporary test proxy tunnel ready on server loopback:22334", flush=True)
try:
    while transport.is_active():
        channel = transport.accept(1)
        if channel:
            threading.Thread(target=relay, args=(channel,), daemon=True).start()
finally:
    client.close()
