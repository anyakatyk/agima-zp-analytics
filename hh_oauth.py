#!/usr/bin/env python3
import argparse
import base64
import hashlib
import http.server
import json
import os
import secrets
import socketserver
import sys
import urllib.error
import urllib.parse
import urllib.request
import webbrowser


AUTHORIZE_URL = "https://hh.ru/oauth/authorize"
TOKEN_URL = "https://api.hh.ru/token"
DEFAULT_REDIRECT_URI = "http://localhost:8080/callback"
SECRETS_DIR = "secrets"


def read_secret(path, required=True):
    try:
        with open(path, "r", encoding="utf-8") as file:
            value = file.read().strip()
    except FileNotFoundError:
        if required:
            raise RuntimeError(f"Missing {path}")
        return ""

    if required and not value:
        raise RuntimeError(f"{path} is empty")
    return value


def write_secret(path, value):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as file:
        file.write(value)
        if not value.endswith("\n"):
            file.write("\n")


def code_challenge(verifier):
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


class CallbackHandler(http.server.BaseHTTPRequestHandler):
    code = None
    error = None

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        CallbackHandler.code = params.get("code", [None])[0]
        CallbackHandler.error = params.get("error", [None])[0]

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(
            "Авторизация HH завершена. Можно вернуться в Codex/терминал.".encode("utf-8")
        )

    def log_message(self, format, *args):
        return


def wait_for_code(port):
    with socketserver.TCPServer(("localhost", port), CallbackHandler) as server:
        server.handle_request()

    if CallbackHandler.error:
        raise RuntimeError(f"HH authorization failed: {CallbackHandler.error}")
    if not CallbackHandler.code:
        raise RuntimeError("HH did not return an authorization code.")
    return CallbackHandler.code


def exchange_code(client_id, client_secret, redirect_uri, code, verifier):
    payload = {
        "grant_type": "authorization_code",
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "code": code,
        "code_verifier": verifier,
    }

    request = urllib.request.Request(
        TOKEN_URL,
        data=urllib.parse.urlencode(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "HH-User-Agent": "hh-salary-collector/0.1",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HH token request failed {error.code}: {details}") from error


def parse_args():
    parser = argparse.ArgumentParser(description="Get HH OAuth tokens for local use.")
    parser.add_argument("--redirect-uri", default=DEFAULT_REDIRECT_URI)
    parser.add_argument("--client-id-file", default=f"{SECRETS_DIR}/hh_client_id")
    parser.add_argument("--client-secret-file", default=f"{SECRETS_DIR}/hh_client_secret")
    parser.add_argument("--tokens-file", default=f"{SECRETS_DIR}/hh_tokens.json")
    parser.add_argument("--access-token-file", default=f"{SECRETS_DIR}/hh_token")
    return parser.parse_args()


def main():
    args = parse_args()

    try:
        client_id = read_secret(args.client_id_file)
        client_secret = read_secret(args.client_secret_file)
        parsed_redirect = urllib.parse.urlparse(args.redirect_uri)
        port = parsed_redirect.port or 80
        verifier = secrets.token_urlsafe(64)

        params = {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": args.redirect_uri,
            "code_challenge": code_challenge(verifier),
            "code_challenge_method": "S256",
        }
        url = f"{AUTHORIZE_URL}?{urllib.parse.urlencode(params)}"

        print("Open this URL and approve access:")
        print(url)
        webbrowser.open(url)
        print(f"Waiting for HH redirect on {args.redirect_uri} ...")

        code = wait_for_code(port)
        tokens = exchange_code(client_id, client_secret, args.redirect_uri, code, verifier)

        write_secret(args.tokens_file, json.dumps(tokens, ensure_ascii=False, indent=2))
        access_token = tokens.get("access_token")
        if not access_token:
            raise RuntimeError("HH response did not include access_token.")
        write_secret(args.access_token_file, access_token)

        print(f"Saved tokens to {args.tokens_file}")
        print(f"Saved access token to {args.access_token_file}")
    except RuntimeError as error:
        print(error, file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

