# Cloudflare Python Workers: python-docx compatibility gate

This isolated probe does **not** deploy the existing Flask app or connect Supabase. It uses only fictional amounts.

Cloudflare runs Python Workers under Pyodide. A successful `pip install` on a normal desktop does **not** establish runtime compatibility. Only a working Pywrangler/Cloudflare Worker that creates and reopens the DOCX passes this gate.

## Local runtime test

Install `uv` and Node.js according to the official documentation, then:

```bash
cd cloudflare-compat
uv sync
uv run pywrangler dev
```

Open `http://localhost:8787/`, or run:

```bash
curl -i http://localhost:8787/
```

Pass criteria: HTTP 200 with `"success":true`, a positive `docx_bytes` count, and `"reopened_total":"21312"`.

If the dependency resolver or Worker fails, retain the complete error and assess a Cloudflare-compatible JavaScript DOCX generator before migrating production code.

## Remote Cloudflare test

```bash
uv run pywrangler deploy
```

Visit the Worker URL and confirm the same response. **Do not consider the compatibility gate passed until the remote Worker responds successfully.**

This Worker is intentionally separated from `app.py`, `assets/original_template.docx`, and any database. Do not merge a runtime migration before confirming that the complete original template can be opened, modified, and saved in the chosen Worker runtime.

Docs: https://developers.cloudflare.com/workers/languages/python/packages/
