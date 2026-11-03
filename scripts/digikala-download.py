#!/usr/bin/env python3
"""Discover and download Digikala product images using Python's standard library."""
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://api.digikala.com"
MANIFEST = pathlib.Path(os.environ.get("MANIFEST", "scripts/digikala-products.json"))
WORKDIR = pathlib.Path(os.environ.get("IMAGE_WORKDIR", "/tmp/novamarket-digikala-images"))
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
}

def request(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read(), response.headers

def get_json(url):
    raw, _ = request(url)
    return json.loads(raw.decode("utf-8"))

def read_manifest():
    with MANIFEST.open(encoding="utf-8") as f:
        return json.load(f)

def image_urls(product):
    found = []
    def add(value):
        if isinstance(value, str) and value.startswith("https://"):
            found.append(value)
        elif isinstance(value, dict):
            for key in ("url", "src", "webp_url", "webp"):
                v = value.get(key)
                if isinstance(v, str) and v.startswith("https://"):
                    found.append(v)
                    break
    images = product.get("images")
    if isinstance(images, list):
        for item in images:
            add(item)
    elif isinstance(images, dict):
        for key in ("main", "image", "main_image", "list"):
            value = images.get(key)
            if isinstance(value, list):
                for item in value:
                    add(item)
            else:
                add(value)
    if not found:
        add(product.get("image") or product.get("image_url") or product.get("thumbnail"))
    return list(dict.fromkeys(found))

def search_products(data):
    return data.get("data", {}).get("products", []) or data.get("data", {}).get("widget", {}).get("data", {}).get("products", [])

def make_candidate(product):
    pid = product.get("id") or product.get("product_id")
    title = product.get("title_fa") or product.get("title") or product.get("name")
    urls = image_urls(product)
    if not pid or not title or not urls:
        return None
    return {
        "digikalaProductId": str(pid),
        "title": str(title),
        "productUrl": f"https://www.digikala.com/product/dkp-{pid}/",
        "imageUrl": urls[0],
    }

def discover(items):
    results = []
    for item in items:
        try:
            url = BASE + "/v1/search/?q=" + urllib.parse.quote(item["query"])
            data = get_json(url)
            candidates = [c for c in (make_candidate(p) for p in search_products(data)) if c][:10]
            results.append({**item, "candidates": candidates})
            print(f'{item["slug"]}: {len(candidates)} candidate(s)')
        except Exception as exc:
            results.append({**item, "candidates": [], "error": str(exc)})
            print(f'{item["slug"]}: ERROR: {exc}', file=sys.stderr)
        time.sleep(0.7)
    output = MANIFEST.parent / "digikala-candidates.json"
    output.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Candidate file: {output}")
    print("No MinIO or database changes were made.")

def download(items):
    missing = [x["slug"] for x in items if not x.get("digikalaProductId")]
    if missing:
        raise RuntimeError("Select Digikala IDs in the manifest first. Missing: " + ", ".join(missing))
    WORKDIR.mkdir(parents=True, exist_ok=True)
    report = []
    for item in items:
        data = get_json(BASE + "/v2/product/" + urllib.parse.quote(str(item["digikalaProductId"])) + "/")
        product = data.get("data", {}).get("product") or data.get("data") or data.get("product") or data
        urls = image_urls(product)
        if not urls:
            raise RuntimeError("No image URL in Digikala detail response for " + item["slug"])
        raw, headers = request(urls[0])
        content_type = headers.get("Content-Type", "").split(";")[0].lower()
        if not content_type.startswith("image/"):
            raise RuntimeError(f'Non-image response for {item["slug"]}: {content_type}')
        if len(raw) < 5000:
            raise RuntimeError(f'Image too small for {item["slug"]}: {len(raw)} bytes')
        ext = "png" if "png" in content_type else "webp" if "webp" in content_type else "jpg"
        dest = WORKDIR / f'{item["slug"]}.{ext}'
        dest.write_bytes(raw)
        report.append({
            "slug": item["slug"],
            "digikalaProductId": str(item["digikalaProductId"]),
            "title": product.get("title_fa") or product.get("title") or item["query"],
            "sourceUrl": urls[0],
            "file": str(dest),
            "contentType": content_type,
            "bytes": len(raw),
        })
        print(f'Downloaded {item["slug"]} ({len(raw)} bytes)')
        time.sleep(0.4)
    (WORKDIR / "download-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Downloaded {len(report)} images to {WORKDIR}. Review before import.")

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "discover"
    products = read_manifest()
    if mode == "discover":
        discover(products)
    elif mode == "download":
        download(products)
    else:
        raise SystemExit("Usage: python3 scripts/digikala-download.py [discover|download]")
