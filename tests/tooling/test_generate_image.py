import importlib.util
import io
import base64
import tempfile
from email.parser import BytesParser
from email.policy import default
from pathlib import Path
import unittest
from unittest.mock import patch
import urllib.request
import urllib.error

spec = importlib.util.spec_from_file_location("generate_image", Path(__file__).resolve().parents[2] / "scripts/generate_image.py")
images = importlib.util.module_from_spec(spec)
spec.loader.exec_module(images)


class ImageTaskTests(unittest.TestCase):
    def test_multipart_edit_preserves_reference_bytes_and_unicode_prompt(self):
        data = b"\x89PNG\r\n\x1a\nfixture\r\n"
        with tempfile.TemporaryDirectory() as directory:
            reference = Path(directory) / 'private-name.png'
            reference.write_bytes(data)
            body, content_type = images.image_edit_body({"prompt": "保留背景", "model": "test"}, reference)
        parsed = BytesParser(policy=default).parsebytes(
            f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode() + body)
        parts = list(parsed.iter_parts())
        self.assertEqual(parts[0].get_payload(decode=True).decode(), "保留背景")
        self.assertEqual(parts[2].get_payload(decode=True), data)
        self.assertEqual(parts[2].get_filename(), "reference.png")
        self.assertNotIn(b"private-name", body)

    def test_sync_base64_result_saves_image_and_preserves_existing_files(self):
        data = b"\x89PNG\r\n\x1a\nfixture"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            paths = images.save_sync_result({"data": [{"b64_json": base64.b64encode(data).decode()}]}, root)
            self.assertEqual(paths[0].read_bytes(), data)
            with self.assertRaises(FileExistsError):
                images.save_image(data, root, paths[0].stem)

    def test_sync_invalid_base64_or_non_image_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            for value in ("not!base64", base64.b64encode(b"<html>error</html>").decode(), 4):
                with self.assertRaises(images.ImageError):
                    images.save_sync_result({"data": [{"b64_json": value}]}, Path(directory))
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_sync_url_result_uses_unauthenticated_download(self):
        with patch.object(images, "download", return_value=Path("image.png")) as download:
            images.save_sync_result({"data": [{"url": "https://storage.example/image.png"}]}, Path("output"))
        self.assertEqual(download.call_args.args[:2], ("https://storage.example/image.png", Path("output")))

    def test_processing_then_completed_uses_same_key_and_never_posts(self):
        calls = []
        responses = iter([{"status": "processing"}, {
            "status": "completed", "result": {"data": [{"url": "https://storage.example/image.png"}]}}])

        def fetch(base, key, path, **kwargs):
            calls.append((key, path, kwargs))
            return next(responses)

        urls = images.poll("https://example.com", "test-key", "imgtask_test",
                           fetch=fetch, sleep=lambda _: None)
        self.assertEqual(urls, ["https://storage.example/image.png"])
        self.assertEqual(len(calls), 2)
        self.assertTrue(all(k == "test-key" and p == "/v1/images/tasks/imgtask_test"
                            and "body" not in opts for k, p, opts in calls))

    def test_failed_or_unknown_status_stops_without_retry(self):
        for status in ("failed", "unexpected", None):
            calls = []

            def fetch(*args, **kwargs):
                calls.append(1)
                return {"status": status, "error": "sensitive text must not be emitted"}

            with self.assertRaises(images.ImageError) as caught:
                images.poll("https://example.com", "test", "imgtask_test", fetch=fetch)
            self.assertEqual(len(calls), 1)
            self.assertNotIn("sensitive", str(caught.exception))

    def test_timeout_retains_task_id_and_bounds_sleep(self):
        now = [0]
        sleeps = []

        def sleep(seconds):
            sleeps.append(seconds)
            now[0] += seconds

        with self.assertRaisesRegex(images.ImageError, "poll imgtask_test"):
            images.poll("https://example.com", "test", "imgtask_test", interval=3,
                        max_wait=5, clock=lambda: now[0], sleep=sleep,
                        fetch=lambda *a, **kw: {"status": "processing"})
        self.assertEqual(sleeps, [3, 2])

    def test_redirects_and_unsafe_urls_are_rejected(self):
        for url in ("http://example.com/a", "https://user:pass@example.com/a", "file:///a"):
            with self.assertRaises(images.ImageError):
                images.https_url(url)
        with self.assertRaises(images.ImageError):
            images.NoRedirect().redirect_request(None, None, 302, "", {}, "https://other.example")
        for identifier in ("../../secret", "imgtask_a?x=1", None):
            with self.assertRaises(images.ImageError):
                images.task_id(identifier)

    def test_download_omits_authorization_and_rejects_html(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, limit): return b"<html>Not an image</html>"

        class Opener:
            def open(self, request, timeout):
                self.request = request
                return Response()

        opener = Opener()
        with patch.object(urllib.request, "build_opener", return_value=opener):
            with self.assertRaises(images.ImageError):
                images.download("https://storage.example/a", Path("unused"), "test")
        self.assertIsNone(opener.request.get_header("Authorization"))

    def test_network_failure_does_not_repeat_submission(self):
        with patch.object(urllib.request.OpenerDirector, "open", side_effect=TimeoutError) as mocked:
            with self.assertRaisesRegex(images.ImageError, "never automatically repeated"):
                images.request_json("https://example.com", "test", "/v1/images/generations/async", {"prompt": "test"})
            self.assertEqual(mocked.call_count, 1)

    def test_completed_response_requires_valid_images(self):
        for payload in ({}, {"result": {"data": []}}, {"result": {"data": [{"url": "http://example.com/a"}]}}):
            with self.assertRaises(images.ImageError):
                images.result_urls(payload)

    def test_disabled_async_service_has_actionable_redacted_error(self):
        body = b'{"error":{"message":"async image tasks are not enabled","private":"test-secret"}}'
        error = urllib.error.HTTPError("https://example.com", 404, "Not Found", {}, io.BytesIO(body))
        with patch.object(urllib.request.OpenerDirector, "open", side_effect=error):
            with self.assertRaises(images.ImageError) as caught:
                images.request_json("https://example.com", "test-secret", "/v1/images/generations/async", {})
        self.assertIn("async image tasks are not enabled", str(caught.exception))
        self.assertNotIn("test-secret", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
