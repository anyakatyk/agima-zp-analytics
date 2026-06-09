#!/usr/bin/env python3
import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path


DEFAULT_CONFIG = "llm_config.json"


def load_config(path):
    with open(path, "r", encoding="utf-8") as file:
        config = json.load(file)
    return {
        "llm_base_url": config["llm_base_url"].rstrip("/"),
        "llm_model": config["llm_model"],
        "timeout_seconds": int(config.get("timeout_seconds", 30)),
    }


def request_json(url, *, timeout, payload=None):
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8")
            return json.loads(body)
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {error.code}: {details}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Connection error: {error.reason}") from error
    except TimeoutError as error:
        raise RuntimeError("Connection timed out") from error
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Response is not valid JSON: {error}") from error


def model_names(tags_response):
    models = tags_response.get("models", [])
    names = []
    for model in models:
        if isinstance(model, dict) and model.get("name"):
            names.append(model["name"])
    return names


def check_llm(config):
    base_url = config["llm_base_url"]
    model = config["llm_model"]
    timeout = config["timeout_seconds"]

    print(f"Base URL: {base_url}")
    print(f"Model: {model}")

    print("\n1. Checking /api/tags ...")
    tags = request_json(f"{base_url}/api/tags", timeout=timeout)
    names = model_names(tags)
    print(f"Available models: {', '.join(names) if names else 'none'}")

    if model not in names:
        print(f"\nResult: server is reachable, but model '{model}' was not found.")
        print(f"Install it on the Ollama host with: ollama pull {model}")
        return 2

    print("\n2. Checking /api/generate ...")
    generated = request_json(
        f"{base_url}/api/generate",
        timeout=timeout,
        payload={
            "model": model,
            "prompt": "Reply with OK only.",
            "stream": False,
        },
    )
    response = (generated.get("response") or "").strip()
    print(f"Response: {response}")

    if not response:
        print("\nResult: model responded, but response text is empty.")
        return 3

    print("\nResult: LLM connection works.")
    return 0


def parse_args():
    parser = argparse.ArgumentParser(description="Check local Ollama-compatible LLM connection.")
    parser.add_argument("--config", default=DEFAULT_CONFIG)
    return parser.parse_args()


def main():
    args = parse_args()
    config_path = Path(args.config)
    if not config_path.exists():
        print(f"Missing config file: {config_path}", file=sys.stderr)
        return 1

    try:
        config = load_config(config_path)
        return check_llm(config)
    except RuntimeError as error:
        print(f"\nResult: LLM connection failed.\n{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

