"""Generate images synchronously or with Sub2API tasks; Python 3.11+ only."""
import argparse
import base64
import binascii
import getpass
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE_URL = "https://dash.ovload.com"
MAX_JSON = 2 * 1024 * 1024
MAX_IMAGE = 40 * 1024 * 1024


class ImageError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward credentials to redirects or silently change POST to GET.
        raise ImageError("HTTP redirect rejected; check the configured endpoint.")


def https_url(value):
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ImageError("A credential-free HTTPS URL is required.")
    return value


def task_id(value):
    if not isinstance(value, str) or not re.fullmatch(r"imgtask_[A-Za-z0-9_-]{1,160}", value):
        raise ImageError("Invalid image task ID.")
    return value


def bounded_read(response, limit):
    data = response.read(limit + 1)
    if len(data) > limit:
        raise ImageError("Response exceeds the configured size limit.")
    return data


def request_json(base, key, path, body=None, timeout=30, response_limit=MAX_JSON,
                 content_type="application/json"):
    headers = {"Authorization": "Bearer " + key, "Accept": "application/json",
               "User-Agent": "Ovload-Image-Tool/1.0"}
    data = None
    if body is not None:
        data = body if isinstance(body, bytes) else json.dumps(body).encode("utf-8")
        headers["Content-Type"] = content_type
    request = urllib.request.Request(base + path, data=data, headers=headers)
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=timeout) as response:
            payload = json.loads(bounded_read(response, response_limit))
    except urllib.error.HTTPError as error:
        # Upstream bodies and signed URLs can contain secrets; do not print them.
        detail = ""
        try:
            failure = json.loads(bounded_read(error, MAX_JSON))
            failure = failure.get("error", {}) if isinstance(failure, dict) else {}
            code = failure.get("code") if isinstance(failure, dict) else None
            if isinstance(code, str) and re.fullmatch(r"[A-Z_]{3,64}", code):
                detail = " (" + code + ")"
            message = failure.get("message", "") if isinstance(failure, dict) else failure
            if message == "async image tasks are not enabled":
                detail += ": async image tasks are not enabled on the server"
        except (ValueError, OSError, ImageError):
            pass
        raise ImageError(f"API returned HTTP {error.code}{detail}; response body suppressed.") from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise ImageError("Network failure. Submission is never automatically repeated; "
                         "if a task ID was printed, resume with poll.") from None
    except (ValueError, UnicodeError):
        raise ImageError("API returned invalid JSON.") from None
    if not isinstance(payload, dict):
        raise ImageError("API response must be a JSON object.")
    return payload


def result_urls(payload):
    result = payload.get("result")
    data = result.get("data") if isinstance(result, dict) else None
    if not isinstance(data, list) or not data:
        raise ImageError("Completed task contains no result.data images.")
    urls = []
    for item in data:
        if not isinstance(item, dict) or not isinstance(item.get("url"), str):
            raise ImageError("Completed task contains an invalid image URL.")
        urls.append(https_url(item["url"]))
    return urls


def poll(base, key, identifier, interval=3, max_wait=1800, fetch=request_json,
         clock=time.monotonic, sleep=time.sleep):
    identifier = task_id(identifier)
    deadline = clock() + max_wait
    previous = None
    while clock() < deadline:
        payload = fetch(base, key, "/v1/images/tasks/" + identifier,
                        timeout=max(.1, min(30, deadline - clock())))
        status = payload.get("status")
        if status != previous:
            print(f"Task {identifier}: {status if status in ('pending', 'queued', 'processing', 'completed', 'failed') else 'unknown'}", flush=True)
            previous = status
        if status == "completed":
            return result_urls(payload)
        if status == "failed":
            raise ImageError("Image task failed; query the dashboard for details. No resubmission made.")
        if status not in ("pending", "queued", "processing"):
            raise ImageError("Unknown task status; stopped without resubmitting.")
        remaining = deadline - clock()
        if remaining > 0:
            sleep(min(interval, remaining))
    raise ImageError(f"Local polling deadline reached. Task may still run; resume with poll {identifier}.")


def image_extension(data):
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return ".webp"
    raise ImageError("Downloaded result is not a supported PNG, JPEG, or WebP image.")


def download(url, directory, name):
    # Object storage requests intentionally contain no API Authorization header.
    request = urllib.request.Request(https_url(url), headers={"User-Agent": "Ovload-Image-Tool/1.0"})
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=60) as response:
            data = bounded_read(response, MAX_IMAGE)
    except (urllib.error.URLError, TimeoutError, OSError):
        raise ImageError("Image download failed. Do not resubmit generation automatically; "
                         "for asynchronous tasks, resume with poll.") from None
    return save_image(data, directory, name)


def save_image(data, directory, name):
    if len(data) > MAX_IMAGE:
        raise ImageError("Image exceeds the configured size limit.")
    path = directory / (name + image_extension(data))
    # Do not overwrite an existing result.
    with path.open("xb") as output:
        output.write(data)
    return path


def save_sync_result(payload, directory):
    items = payload.get("data")
    if not isinstance(items, list) or not items:
        raise ImageError("Synchronous response contains no data images.")
    paths = []
    for index, item in enumerate(items, 1):
        if not isinstance(item, dict):
            raise ImageError("Invalid image result.")
        name = f"image-{time.time_ns()}-{index}"
        if "b64_json" in item:
            encoded = item["b64_json"]
            if not isinstance(encoded, str) or len(encoded) > ((MAX_IMAGE + 2) // 3) * 4:
                raise ImageError("Invalid or oversized base64 image.")
            try:
                data = base64.b64decode(encoded, validate=True)
            except (ValueError, binascii.Error):
                raise ImageError("Invalid base64 image.") from None
            paths.append(save_image(data, directory, name))
        elif isinstance(item.get("url"), str):
            paths.append(download(item["url"], directory, name))
        else:
            raise ImageError("Image result requires b64_json or url.")
        print("Image: " + str(paths[-1]), flush=True)
    return paths


def image_edit_body(fields, reference):
    data = reference.read_bytes()
    if len(data) > MAX_IMAGE:
        raise ImageError("Reference image exceeds the configured size limit.")
    extension = image_extension(data)
    mime = {".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp"}[extension]
    boundary = "ovload-" + uuid.uuid4().hex
    chunks = []
    for name, value in fields.items():
        chunks.append((f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n'
                       f'{value}\r\n').encode("utf-8"))
    chunks.append((f'--{boundary}\r\nContent-Disposition: form-data; name="image"; '
                   f'filename="reference{extension}"\r\nContent-Type: {mime}\r\n\r\n').encode("ascii"))
    chunks.extend([data, f"\r\n--{boundary}--\r\n".encode("ascii")])
    return b"".join(chunks), "multipart/form-data; boundary=" + boundary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=BASE_URL)
    parser.add_argument("--output-dir", type=Path, default=Path("output/imagegen"))
    parser.add_argument("--interval", type=float, default=3)
    parser.add_argument("--max-wait", type=float, default=1800)
    commands = parser.add_subparsers(dest="command", required=True)
    generate = commands.add_parser("generate")
    generate.add_argument("--prompt-file", type=Path, required=True)
    generate.add_argument("--model", default="gpt-image-2.5-flare")
    generate.add_argument("--size", default="1536x1024")
    generate.add_argument("--quality", choices=("auto", "low", "medium", "high"), default="high")
    generate.add_argument("--mode", choices=("async", "sync"), default="async")
    generate.add_argument("--reference-image", type=Path,
                          help="Edit a local image using the documented multipart edits endpoint")
    generate.add_argument("--request-timeout", type=float, default=600,
                          help="Synchronous HTTP timeout in seconds (1-1800); no automatic retries")
    commands.add_parser("poll").add_argument("task_id", type=task_id)
    args = parser.parse_args()
    if not 1 <= args.interval <= 60 or not 1 <= args.max_wait <= 1800:
        parser.error("interval must be 1-60 seconds; max-wait must be 1-1800 seconds")
    base = https_url(args.base_url.rstrip("/"))
    parts = urllib.parse.urlsplit(base)
    if parts.path or parts.query or parts.fragment:
        parser.error("base-url must contain only the HTTPS origin")
    body = None
    endpoint = "/v1/images/generations"
    content_type = "application/json"
    if args.command == "generate":
        if not 1 <= args.request_timeout <= 1800:
            parser.error("request-timeout must be 1-1800 seconds")
        prompt = args.prompt_file.read_text(encoding="utf-8-sig").strip()
        if not prompt or len(prompt) > 32000:
            parser.error("prompt must contain 1-32000 characters")
        body = {"model": args.model, "prompt": prompt, "size": args.size,
                "quality": args.quality, "n": 1}
        if args.reference_image:
            body, content_type = image_edit_body(body, args.reference_image)
            endpoint = "/v1/images/edits"
    directory = args.output_dir.resolve()
    directory.mkdir(parents=True, exist_ok=True)
    key = os.environ.get("OVLOAD_IMAGE_API_KEY") or getpass.getpass("Image API key (hidden): ")
    if not key.strip() or any(c in key for c in "\r\n"):
        raise ImageError("A non-empty, single-line API key is required.")
    if body is not None:
        if args.mode == "sync":
            print("Generating synchronously; waiting for the image response...", flush=True)
            payload = request_json(base, key, endpoint, body,
                                   timeout=args.request_timeout,
                                   response_limit=((MAX_IMAGE + 2) // 3) * 4 + MAX_JSON,
                                   content_type=content_type)
            save_sync_result(payload, directory)
            return
        payload = request_json(base, key, endpoint + "/async", body, timeout=60,
                               content_type=content_type)
        identifier = task_id(payload.get("task_id"))
    else:
        identifier = args.task_id
    print("Task ID: " + identifier, flush=True)
    # Deliberately persist neither credentials, prompts, signed URLs nor raw responses.
    state = directory / (identifier + ".json")
    state.write_text(json.dumps({"task_id": identifier, "base_url": base}, indent=2), encoding="utf-8")
    urls = poll(base, key, identifier, args.interval, args.max_wait)
    for index, url in enumerate(urls, 1):
        print("Image: " + str(download(url, directory, identifier + f"-{index}-{time.time_ns()}")), flush=True)


if __name__ == "__main__":
    try:
        main()
    except (ImageError, OSError) as error:
        print("Error: " + str(error) if isinstance(error, ImageError) else "Error: local file operation failed.", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("Interrupted; upstream work may still run. If a task ID exists, resume with poll.", file=sys.stderr)
        sys.exit(130)
