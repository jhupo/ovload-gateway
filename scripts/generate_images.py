import argparse
import base64
import hashlib
import io
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import ExitStack
from pathlib import Path
from urllib.parse import quote, urlparse

import requests
from PIL import Image


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def safe_message(value, secret):
    message = str(value).replace(secret, "[redacted]") if secret else str(value)
    message = re.sub(r"sk-[A-Za-z0-9_-]+", "[redacted]", message)
    return re.sub(r"https?://\S+", "[URL omitted]", message)[:500]


def response_json(response, secret):
    try:
        payload = response.json()
    except ValueError:
        raise RuntimeError(f"HTTP {response.status_code}: non-JSON response") from None
    if not response.ok:
        error = payload.get("error", payload) if isinstance(payload, dict) else payload
        if isinstance(error, dict):
            error = error.get("message", error.get("detail", "request rejected"))
        raise RuntimeError(f"HTTP {response.status_code}: {safe_message(error, secret)}")
    if not isinstance(payload, dict):
        raise RuntimeError("Expected a JSON object")
    return payload


def save_image(payload, destination):
    result = payload.get("result") or payload
    entries = result.get("data", [])
    entry = entries[0] if entries else {"url": payload.get("image_url")}
    if entry.get("b64_json"):
        content = base64.b64decode(entry["b64_json"], validate=True)
    elif entry.get("url"):
        image_url = entry["url"]
        if urlparse(image_url).scheme != "https":
            raise RuntimeError("Image download must use HTTPS")
        response = requests.get(image_url, timeout=(20, 180))
        if not response.ok:
            raise RuntimeError(f"Image download HTTP {response.status_code}")
        content = response.content
    else:
        raise RuntimeError("No b64_json or image URL in generation result")
    with Image.open(io.BytesIO(content)) as generated:
        generated.load()
        size = list(generated.size)
        temporary = destination.with_suffix(".part")
        generated.save(temporary, format="PNG")
        temporary.replace(destination)
    return size


def generate(job, args, secret):
    name = job["name"]
    destination = args.output / f"{name}.png"
    state_path = args.output / f"{name}.state.json"
    request = {
        "model": args.model,
        "prompt": job["prompt"],
        "size": job.get("size", args.size),
        "quality": args.quality,
        "n": 1,
        "output_format": "png",
    }
    references = [Path(path) for path in job.get("references", args.reference)]
    reference_hashes = [hashlib.sha256(path.read_bytes()).hexdigest() for path in references]
    fingerprint_data = {"base_url": args.base_url, **request}
    if reference_hashes:
        fingerprint_data["references"] = reference_hashes
    fingerprint = hashlib.sha256(
        json.dumps(fingerprint_data, sort_keys=True).encode()
    ).hexdigest()
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {}
    if state and state.get("fingerprint") != fingerprint:
        raise RuntimeError("Output name already belongs to a different prompt; choose a new name")
    (args.output / f"{name}.prompt.txt").write_text(job["prompt"], encoding="utf-8")
    if state.get("status") == "completed" and destination.exists():
        print(f"{name}: using existing image", flush=True)
        return destination
    if state.get("status") == "submitting":
        raise RuntimeError(
            "Previous submission outcome is unknown; check the provider before resubmitting"
        )
    if state.get("status") == "failed":
        raise RuntimeError("Previous task failed; use a new output name for an intentional retry")
    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {secret}"})
    started = time.monotonic()
    try:
        if not state.get("task_id"):
            state = {
                "fingerprint": fingerprint,
                "status": "submitting",
                "model": args.model,
                "size": request["size"],
                "quality": args.quality,
            }
            write_json(state_path, state)
            endpoint = args.base_url + (
                "/v1/images/edits" if references else "/v1/images/generations"
            )
            print(f"{name}: submitting ({args.model})", flush=True)

            def submit(url, timeout):
                if not references:
                    return session.post(url, json=request, timeout=(20, timeout))
                with ExitStack() as stack:
                    files = [
                        ("image[]", ("reference.png", stack.enter_context(path.open("rb")), "image/png"))
                        for path in references
                    ]
                    return session.post(url, data=request, files=files, timeout=(20, timeout))

            response = submit(
                endpoint + ("/async" if args.mode != "sync" else ""),
                args.timeout if args.mode == "sync" else 120,
            )
            if (
                args.mode == "auto"
                and response.status_code == 404
                and "async image tasks are not enabled" in response.text.lower()
            ):
                print(f"{name}: async unavailable, using synchronous endpoint", flush=True)
                response = submit(endpoint, args.timeout)
            if not response.ok:
                state["status"] = "failed"
                write_json(state_path, state)
            payload = response_json(response, secret)
            task_id = payload.get("task_id") or payload.get("id")
            if task_id and not payload.get("data"):
                state.update(status="processing", task_id=task_id)
                write_json(state_path, state)
            else:
                dimensions = save_image(payload, destination)
                state.update(status="completed", dimensions=dimensions)
                write_json(state_path, state)
                print(f"{name}: saved {dimensions[0]}x{dimensions[1]}", flush=True)
                return destination
        next_update = 0
        while time.monotonic() - started < args.timeout:
            response = session.get(
                args.base_url + "/v1/images/tasks/" + quote(state["task_id"], safe=""),
                timeout=(20, 60),
            )
            payload = response_json(response, secret)
            status = payload.get("status")
            if status == "completed":
                dimensions = save_image(payload, destination)
                state.update(status="completed", dimensions=dimensions)
                write_json(state_path, state)
                print(f"{name}: saved {dimensions[0]}x{dimensions[1]}", flush=True)
                return destination
            if status == "failed":
                state["status"] = "failed"
                write_json(state_path, state)
                raise RuntimeError(
                    safe_message(payload.get("error", "Generation task failed"), secret)
                )
            elapsed = int(time.monotonic() - started)
            if elapsed >= next_update:
                print(f"{name}: {status or 'processing'} ({elapsed}s)", flush=True)
                next_update = elapsed + 30
            time.sleep(args.poll_interval)
        raise RuntimeError("Polling timed out; rerun the same command to resume the saved task")
    except requests.RequestException as error:
        raise RuntimeError(
            f"Network error ({type(error).__name__}); saved task state is retained"
        ) from None
    finally:
        session.close()


def main():
    parser = argparse.ArgumentParser(description="Generate PNG designs through Sub2API Images API")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--manifest", type=Path)
    source.add_argument("--prompt-file", type=Path)
    parser.add_argument("--reference", type=Path, action="append", default=[], help="PNG design reference; may be repeated")
    parser.add_argument("--name", default="generated-image")
    parser.add_argument("--output", type=Path, default=Path("generated"))
    parser.add_argument("--base-url", default="https://dash.ovload.com")
    parser.add_argument("--model", default="gpt-image-2.5-sunburst")
    parser.add_argument("--size", default="1536x1024")
    parser.add_argument("--quality", choices=["low", "medium", "high", "auto"], default="high")
    parser.add_argument("--mode", choices=["auto", "async", "sync"], default="auto")
    parser.add_argument("--workers", type=int, choices=range(1, 5), default=2)
    parser.add_argument("--timeout", type=int, default=1800)
    parser.add_argument("--poll-interval", type=float, default=3)
    parser.add_argument("--only", nargs="+")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    args.base_url = args.base_url.rstrip("/")
    base = urlparse(args.base_url)
    if base.scheme != "https" or not base.netloc or base.username or base.query or base.fragment:
        parser.error("--base-url must be an HTTPS URL without credentials, query or fragment")
    if args.timeout <= 0 or args.poll_interval <= 0:
        parser.error("Timeout and poll interval must be positive")
    if args.manifest:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8-sig"))
        jobs = [
            {**item, "prompt": manifest.get("common_prompt", "") + "\n\n" + item["prompt"]}
            for item in manifest["images"]
        ]
    else:
        jobs = [{"name": args.name, "prompt": args.prompt_file.read_text(encoding="utf-8-sig")}]
    if args.only:
        unknown = set(args.only) - {job["name"] for job in jobs}
        if unknown:
            parser.error("Unknown image names: " + ", ".join(sorted(unknown)))
        jobs = [job for job in jobs if job["name"] in args.only]
    names = [job["name"] for job in jobs]
    if len(names) != len(set(names)) or not jobs:
        parser.error("Image names must be unique and at least one image is required")
    if any(not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]*", name) for name in names):
        parser.error("Image names must contain only letters, numbers, underscores and hyphens")
    args.output.mkdir(parents=True, exist_ok=True)
    if args.dry_run:
        print(f"Validated {len(jobs)} prompts; no API request made")
        return 0
    secret = os.environ.get("SUB2API_API_KEY") or os.environ.get("API_KEY")
    if not secret:
        parser.error("Set SUB2API_API_KEY or API_KEY in the environment")
    failed = False
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(generate, job, args, secret): job["name"] for job in jobs}
        for future in as_completed(futures):
            try:
                future.result()
            except Exception as error:
                failed = True
                print(
                    f"{futures[future]}: {safe_message(error, secret)}", file=sys.stderr, flush=True
                )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
