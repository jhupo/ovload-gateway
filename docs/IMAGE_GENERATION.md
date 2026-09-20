# Image generation

`scripts/generate_image.py` is a standalone development tool for the custom
Sub2API image API at `https://dash.ovload.com`. It is not an OpenAI
SDK runner, an official OpenAI endpoint, or a gateway runtime/provider module.
Requires Python 3.11+; no third-party packages.

Run from the repository root:

```powershell
python scripts/generate_image.py generate --prompt-file C:/path/to/prompt.txt --model gpt-image-2.5-flare --size 1536x1024
```

The script prompts for a hidden key unless `OVLOAD_IMAGE_API_KEY` is set in the
process environment. Never put keys in arguments, tracked files, or shell history.
Use the same key to submit and poll a task. Credentials are never persisted.

For explicit synchronous generation (no server-side image storage required):

```powershell
python scripts/generate_image.py generate --mode sync --prompt-file C:/path/to/prompt.txt --model gpt-image-2.5-flare --size 1536x864
```

This uses POST `/v1/images/generations` and waits for `data[].b64_json` or
`data[].url`. Base64 images are decoded locally; URL images are downloaded without
the API token. The HTTP timeout defaults to 600 seconds and can be set with
`--request-timeout` (maximum 1800). Proxies may impose shorter timeouts. A failed
or timed-out submission is never repeated automatically, since upstream work may
already have executed. Synchronous requests do not provide a resumable task ID.
Modes are explicit; the tool never silently switches between sync and async.

The supplied service guide documents POST `/v1/images/generations/async` and GET
`/v1/images/tasks/{task_id}`. The account group must enable image generation and
the server must enable image storage. Polling defaults to every 3 seconds, with a
30-minute local deadline. The guide says remote tasks/results expire after 24 hours.

The model option is passed through unchanged. Models shown in the user's catalog:

- `gpt-image-2-firefly`
- `gpt-image-2.5-flare`
- `gpt-image-2.5-flare-firefly`
- `gpt-image-2.5-sunburst`
- `gpt-image-2.5-sunburst-firefly`

Availability and permissions depend on the service; catalog presence does not
verify each model. This tool implements synchronous and asynchronous image generation
and single-reference image editing, not video or audio.

Images and task receipts are saved under ignored `output/imagegen/`. Receipts
contain only the task ID and endpoint origin, not prompts, keys or signed URLs.
Credentials are sent only to the configured API origin. Redirects are rejected;
image downloads never receive the API bearer token. TLS verification stays enabled.

To resume an existing task without paying for another generation:

```powershell
python scripts/generate_image.py --interval 5 --max-wait 1800 poll imgtask_REPLACE_WITH_TASK_ID
```

Global flags precede the subcommand. Set `--output-dir` to select another folder.
Submission is never retried automatically: a timeout may occur after the server
accepted it. Polling errors stop with the task ID retained; fix the cause and
resume. Interrupting the client does not cancel the remote task. Completed images
use unique filenames so earlier results are preserved. Raw upstream error bodies
are suppressed to prevent accidental credential or prompt exposure.

Run regression checks with `python -m unittest discover -s tests/tooling -v`.

## Live verification on 2026-09-19

Authenticated model listing succeeded and included all five catalog variants
above, plus `gpt-image-2`. An asynchronous generation request using
`gpt-image-2.5-flare` returned HTTP 404 with the exact message
`async image tasks are not enabled`. No task ID or image was issued. The task
lookup route responded with structured `IMAGE_TASK_NOT_FOUND` for a nonexistent
probe ID. These checks verify authentication/catalog access and the error path,
not successful generation. Configure and enable server-side `image_storage`
before repeating the generation command. Do not automatically switch to a
synchronous endpoint or another model when asynchronous generation is disabled.

A subsequent user-authorized synchronous request to `/v1/images/generations`
succeeded with `gpt-image-2.5-flare`. The returned PNG was saved and visually
inspected as `output/imagegen/ovload-home-dark-v1.png` (2560x1440; requested
1536x864). This verifies one synchronous generation, not all listed model variants.

## Preserve a scene while adding an interface

Use a previously generated local image as an edit target:

```powershell
python scripts/generate_image.py generate --mode sync --reference-image output/imagegen/background.png --prompt-file C:/path/to/edit-prompt.txt --model gpt-image-2.5-flare --size 1536x864
```

This explicitly uses multipart POST `/v1/images/edits` (or `/async` in async mode).
Only the selected PNG, JPEG, or WebP file is uploaded; the original local filename
is replaced with a generic filename. Outputs are saved separately. Reference
uploads are limited to 40 MiB. Prompts should specify exactly what changes and
which composition, labels and positions must remain. Generated edits can still
vary; inspect both frames before using them as an animation reference.
