"""Cloudflare Python Worker DOCX compatibility probe.

No employee records, external storage, authentication, or secrets.
A successful response requires creation AND reopening of a .docx file in Workers.
"""
from io import BytesIO
from workers import Response, WorkerEntrypoint


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        if request.method != "GET":
            return Response.json({"success": False, "error": "Only GET supported"}, status=405)
        try:
            import docx
            from docx import Document

            document = Document()
            document.add_heading("DSA compatibility test", level=1)
            table = document.add_table(rows=2, cols=2)
            table.cell(0, 0).text = "DSA days"
            table.cell(0, 1).text = "3"
            table.cell(1, 0).text = "Total claim BDT"
            table.cell(1, 1).text = "21312"
            output = BytesIO()
            document.save(output)
            raw = output.getvalue()
            opened = Document(BytesIO(raw))
            actual = opened.tables[0].cell(1, 1).text
            if actual != "21312" or not raw.startswith(b"PK"):
                raise RuntimeError("Generated DOCX validation failed")
            return Response.json({
                "success": True,
                "package": "python-docx",
                "docx_bytes": len(raw),
                "reopened_total": actual,
            })
        except Exception as exc:
            # No confidential data is handled by this Worker.
            return Response.json({
                "success": False,
                "exception_type": type(exc).__name__,
                "error": str(exc)[:400]
            }, status=500)
