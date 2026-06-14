"""
Validation Service — language-aware student-code validation.

Two validation strategies, chosen per language profile:

  STRUCTURAL  (web stack: html, css)
      Markup/structure checks — these are rendered client-side, not executed.

  EXECUTION   (java, python, dart, javascript, typescript, c, c++, c#, go,
               rust, php, kotlin)
      Compile + run the code in the sandbox (agent-gateway → Piston), execute
      every test case (stdin → expected stdout), compare outputs, and surface
      compilation errors, runtime errors and failed assertions.

The service NEVER reports success for an executable language unless the code
compiles, the required keywords are present, AND every test case passes (or, when
a TP defines no test cases, the program at least compiles and runs cleanly).
When the sandbox is unavailable it degrades to a local syntax check where one
exists and otherwise reports that it could not validate — it never falsely says
"looks good".

POST /api/validate
  { language, code, required_tags[], required_keywords[], test_cases[] }
  → structured ValidateResponse (see below)
"""
import ast
import os
import re
from typing import Any

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

AGENT_GATEWAY_URL = os.getenv("AGENT_GATEWAY_URL", f"http://localhost:{os.getenv('AGENT_GATEWAY_PORT', '8000')}")

app = FastAPI(title="Validation Service", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Models ───────────────────────────────────────────────────────────────────

class TestCase(BaseModel):
    name: str = ""
    stdin: str = ""
    expected_stdout: str = ""


class ValidateRequest(BaseModel):
    language: str = "html"
    code: str = ""
    required_tags: list[str] = []        # HTML tags (web) — reused as keywords elsewhere
    required_keywords: list[str] = []
    test_cases: list[TestCase] = []


class TestResult(BaseModel):
    name: str
    passed: bool
    stdin: str = ""
    expected: str = ""
    actual: str = ""
    stderr: str = ""


class ValidateResponse(BaseModel):
    valid: bool
    # checked: structure | syntax | execution | unavailable
    checked: str
    language: str
    errors: list[str] = []
    hints: list[str] = []
    suggestions: list[str] = []
    missing: list[str] = []
    test_results: list[TestResult] = []
    tests_passed: int = 0
    tests_total: int = 0
    compile_output: str = ""
    runtime_error: str = ""


# ─── Language profiles ────────────────────────────────────────────────────────

WEB_LANGUAGES = {"html", "css", "web"}
# Languages we can compile/run in the sandbox. id → display name.
EXECUTABLE_LANGUAGES = {
    "java", "python", "py", "dart", "javascript", "js", "typescript", "ts",
    "c", "cpp", "c++", "csharp", "cs", "go", "rust", "php", "kotlin", "node",
}
# Local syntax fallback when the sandbox is down.
LOCAL_SYNTAX = {"python", "py", "javascript", "js", "node", "typescript", "ts"}

# Normalise aliases to the id the sandbox understands.
SANDBOX_ALIASES = {
    "js": "javascript", "node": "javascript", "ts": "typescript",
    "py": "python", "c++": "cpp", "cs": "csharp",
}


def _sandbox_id(language: str) -> str:
    lang = language.strip().lower()
    return SANDBOX_ALIASES.get(lang, lang)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _present(code: str, keyword: str) -> bool:
    """
    Token-aware presence check. A bare-word keyword like `int` must appear as a
    whole token — it must NOT match inside another identifier (e.g. `int` hiding
    in `pr·int`). Symbolic keywords (operators, `::`, `@Override`, `#include`,
    `println!`) can't use word boundaries, so they fall back to substring.
    """
    kw = (keyword or "").strip()
    if not kw:
        return True
    if re.fullmatch(r"\w+", kw):
        return re.search(rf"(?<!\w){re.escape(kw)}(?!\w)", code, re.IGNORECASE) is not None
    return kw.lower() in code.lower()


def _missing_keywords(code: str, keywords: list[str]) -> list[str]:
    return [k for k in keywords if k and not _present(code, k)]


def _normalize_output(text: str) -> str:
    """Compare outputs ignoring trailing whitespace and blank trailing lines."""
    lines = [ln.rstrip() for ln in (text or "").replace("\r\n", "\n").split("\n")]
    while lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines)


class SandboxDown(Exception):
    pass


async def _sandbox_run(language: str, code: str, stdin: str = "") -> dict:
    """Run code via the agent-gateway sandbox. Raises SandboxDown on infra failure."""
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{AGENT_GATEWAY_URL}/api/execute",
                json={"language": _sandbox_id(language), "code": code, "stdin": stdin},
            )
        if resp.status_code == 200:
            return resp.json()
        # Gateway returns {"detail": {"kind","message"}} on infra failure.
        detail = resp.json().get("detail", {}) if "application/json" in resp.headers.get("content-type", "") else {}
        kind = detail.get("kind") if isinstance(detail, dict) else None
        if kind in {"sandbox_unreachable", "timeout", "sandbox_error"}:
            raise SandboxDown(detail.get("message", "sandbox unavailable"))
        # unsupported_language / other → treat as a hard validation failure
        return {"ok": False, "kind": kind or "sandbox_error",
                "compile_output": "", "stderr": (detail.get("message", "") if isinstance(detail, dict) else ""),
                "stdout": "", "exit_code": 1}
    except (httpx.ConnectError, httpx.TimeoutException) as e:
        raise SandboxDown(str(e))


# ─── Structural (web) validators ──────────────────────────────────────────────

def validate_html(req: ValidateRequest) -> ValidateResponse:
    code, errors, hints = req.code, [], []
    missing = [t for t in req.required_tags
               if not re.search(rf"<\s*{re.escape(t)}(\s|>|/)", code, re.IGNORECASE)]
    for t in missing:
        errors.append(f"Missing required element: <{t}>")
        hints.append(f"Add a <{t}> element — re-read the step instructions for where it belongs.")
    opens = len(re.findall(r"<([a-zA-Z][a-zA-Z0-9]*)(?![^>]*/>)[^>]*>", code))
    closes = len(re.findall(r"</[a-zA-Z][a-zA-Z0-9]*\s*>", code))
    void = len(re.findall(r"<(img|br|hr|input|meta|link|source)[\s>/]", code, re.IGNORECASE))
    if closes > 0 and opens - void - closes > 2:
        errors.append("Some elements are never closed.")
        hints.append("Check that every opening tag has a matching closing tag (e.g. <p>…</p>).")
    if code.strip() and not re.search(r"<!doctype\s+html>", code, re.IGNORECASE):
        hints.append("Tip: start the document with <!DOCTYPE html>.")
    return ValidateResponse(valid=not errors, checked="structure", language="html",
                            errors=errors, hints=hints, missing=missing)


def validate_css(req: ValidateRequest) -> ValidateResponse:
    code, errors, hints = req.code, [], []
    if code.count("{") != code.count("}"):
        errors.append("Unbalanced braces { } in your CSS.")
        hints.append("Every selector block must open with { and close with }.")
    if code.strip() and not re.search(r"[^{}]+\{[^{}]*:[^{}]*\}", code, re.DOTALL):
        errors.append("No valid CSS rule found (selector { property: value; }).")
    missing = _missing_keywords(code, req.required_keywords)
    errors += [f"Missing required CSS: {k}" for k in missing]
    return ValidateResponse(valid=not errors, checked="structure", language="css",
                            errors=errors, hints=hints, missing=missing)


# ─── Local syntax fallback (sandbox down) ─────────────────────────────────────

def _local_syntax_ok(language: str, code: str) -> tuple[bool, str]:
    lang = _sandbox_id(language)
    if lang == "python":
        try:
            ast.parse(code)
            return True, ""
        except SyntaxError as e:
            return False, f"Python syntax error on line {e.lineno}: {e.msg}"
    if lang in {"javascript", "typescript"}:
        try:
            import esprima
            esprima.parseModule(code, {"jsx": True, "tolerant": False})
            return True, ""
        except Exception as e:  # noqa: BLE001
            return False, f"JavaScript/TypeScript syntax error: {e}"
    return True, ""  # no local checker for this language


# ─── Execution-based validation ───────────────────────────────────────────────

async def validate_by_execution(req: ValidateRequest) -> ValidateResponse:
    lang = req.language.strip().lower()
    if not req.code.strip():
        return ValidateResponse(valid=False, checked="execution", language=lang,
                                errors=["No code submitted."],
                                suggestions=["Write your solution before validating."])

    keywords = list(req.required_keywords) + list(req.required_tags)
    missing = _missing_keywords(req.code, keywords)

    try:
        base = await _sandbox_run(lang, req.code)
    except SandboxDown as e:
        ok, msg = _local_syntax_ok(lang, req.code)
        if lang in LOCAL_SYNTAX:
            errors = [] if ok else [msg]
            errors += [f"Missing required code: {k}" for k in missing]
            return ValidateResponse(
                valid=ok and not missing, checked="syntax", language=lang,
                errors=errors, missing=missing,
                suggestions=["Sandbox offline — only a syntax check ran. Full test execution was skipped."],
            )
        return ValidateResponse(
            valid=False, checked="unavailable", language=lang,
            errors=[f"Could not validate: execution sandbox unavailable ({e})."],
            suggestions=["Start/connect the execution sandbox, then validate again."],
        )

    # Compilation error → fail fast with the compiler message.
    if base.get("kind") == "compile_error":
        return ValidateResponse(
            valid=False, checked="execution", language=lang,
            errors=["Compilation failed."], compile_output=base.get("compile_output", ""),
            missing=missing,
            suggestions=["Fix the compilation errors shown above before running test cases."],
        )

    suggestions = []
    if missing:
        suggestions.append("Your solution is missing required concepts: " + ", ".join(missing))

    # No test cases: success means it compiled and ran cleanly + required keywords present.
    if not req.test_cases:
        runtime_err = base.get("stderr", "") if base.get("kind") == "runtime_error" else ""
        valid = base.get("kind") == "success" and not missing
        errors = []
        if base.get("kind") == "runtime_error":
            errors.append("Program exited with a runtime error.")
        errors += [f"Missing required code: {k}" for k in missing]
        return ValidateResponse(
            valid=valid, checked="execution", language=lang, errors=errors,
            missing=missing, runtime_error=runtime_err, suggestions=suggestions,
        )

    # Run every test case and compare stdout.
    results: list[TestResult] = []
    for i, tc in enumerate(req.test_cases):
        try:
            r = await _sandbox_run(lang, req.code, tc.stdin)
        except SandboxDown as e:
            return ValidateResponse(
                valid=False, checked="unavailable", language=lang,
                errors=[f"Could not run test cases: sandbox became unavailable ({e})."],
            )
        actual = _normalize_output(r.get("stdout", ""))
        expected = _normalize_output(tc.expected_stdout)
        passed = r.get("kind") != "runtime_error" and actual == expected
        results.append(TestResult(
            name=tc.name or f"Test {i + 1}", passed=passed, stdin=tc.stdin,
            expected=expected, actual=actual, stderr=r.get("stderr", ""),
        ))

    passed_n = sum(1 for t in results if t.passed)
    valid = passed_n == len(results) and not missing
    errors = []
    if passed_n < len(results):
        errors.append(f"{len(results) - passed_n} of {len(results)} test case(s) failed.")
    errors += [f"Missing required code: {k}" for k in missing]
    for t in results:
        if not t.passed:
            if t.stderr:
                suggestions.append(f"'{t.name}': runtime error — {t.stderr.strip()[:160]}")
            else:
                suggestions.append(f"'{t.name}': expected `{t.expected[:60]}` but got `{t.actual[:60]}`")
    return ValidateResponse(
        valid=valid, checked="execution", language=lang, errors=errors,
        missing=missing, test_results=results, tests_passed=passed_n,
        tests_total=len(results), suggestions=suggestions,
    )


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "validation-service",
            "strategies": {"structural": sorted(WEB_LANGUAGES),
                           "execution": sorted(EXECUTABLE_LANGUAGES)}}


@app.post("/api/validate", response_model=ValidateResponse)
async def validate(req: ValidateRequest):
    lang = req.language.strip().lower()
    if lang in {"html", "web"}:
        return validate_html(req)
    if lang == "css":
        return validate_css(req)
    if lang in EXECUTABLE_LANGUAGES:
        return await validate_by_execution(req)
    # Unknown language: presence check only, and say so honestly.
    missing = _missing_keywords(req.code, req.required_keywords + req.required_tags)
    errors = ([] if req.code.strip() else ["No code submitted."]) + \
             [f"Missing required code: {k}" for k in missing]
    return ValidateResponse(valid=not errors, checked="presence", language=lang,
                            errors=errors, missing=missing,
                            suggestions=["No execution profile for this language — only a presence check ran."])


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("VALIDATION_SERVICE_PORT", 8006))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
