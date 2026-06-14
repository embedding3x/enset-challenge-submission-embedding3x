"""
Agent Gateway — public-facing FastAPI service.
Routes frontend requests to the appropriate AI agent services.
Validates JWT tokens from the Auth Service.
"""
import os
import asyncio
import logging
import time
from typing import Any
from datetime import datetime, timezone
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx

import events
import local_sandbox

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../../.env"))

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("agent-gateway")

EXPLANATION_AGENT_URL = os.getenv("EXPLANATION_AGENT_URL", "http://localhost:8001")
HINT_AGENT_URL = os.getenv("HINT_AGENT_URL", "http://localhost:8002")
EVALUATION_AGENT_URL = os.getenv("EVALUATION_AGENT_URL", "http://localhost:8003")
ORCHESTRATOR_URL = os.getenv("ORCHESTRATOR_URL", f"http://localhost:{os.getenv('ORCHESTRATOR_PORT', '8004')}")
AUTH_SERVICE_URL = os.getenv("AUTH_SERVICE_URL", f"http://localhost:{os.getenv('AUTH_SERVICE_PORT', '8081')}")
RAG_SERVICE_URL = os.getenv("RAG_SERVICE_URL", f"http://localhost:{os.getenv('RAG_SERVICE_PORT', '8005')}")
CREATOR_AGENT_URL = os.getenv("CREATOR_AGENT_URL", f"http://localhost:{os.getenv('CREATOR_AGENT_PORT', '8007')}")
VALIDATION_SERVICE_URL = os.getenv("VALIDATION_SERVICE_URL", f"http://localhost:{os.getenv('VALIDATION_SERVICE_PORT', '8006')}")

# Code-execution sandbox. The public Piston API is whitelist-only since 2026-02-15,
# so the default provider is the in-process LOCAL executor (host toolchains). Set
# SANDBOX_PROVIDER=piston + PISTON_URL to a SELF-HOSTED Piston for isolated/prod use.
SANDBOX_PROVIDER = os.getenv("SANDBOX_PROVIDER", "local").strip().lower()
PISTON_URL = os.getenv("PISTON_URL", "http://localhost:2000/api/v2")

app = FastAPI(title="Agent Gateway", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

TIMEOUT = httpx.Timeout(120.0, connect=10.0)


@app.on_event("startup")
async def _init_kafka() -> None:
    """Connect the Kafka event bus. Events degrade gracefully if the broker is down."""
    await events.bus.start()


@app.on_event("shutdown")
async def _stop_kafka() -> None:
    await events.bus.stop()


# ─── Real-time progress broadcasting (WebSocket) ─────────────────────────────

class ConnectionManager:
    """Tracks connected dashboards and fan-outs student progress events to them."""

    def __init__(self) -> None:
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, message: dict) -> None:
        stale: list[WebSocket] = []
        for ws in self.active:
            try:
                await ws.send_json(message)
            except Exception:  # noqa: BLE001
                stale.append(ws)
        for ws in stale:
            self.disconnect(ws)


manager = ConnectionManager()


# ─── Request / Response Models ───────────────────────────────────────────────

class ExplainRequest(BaseModel):
    tp_id: str
    tp_title: str
    tp_description: str
    step_id: str
    step_title: str
    step_instructions: str
    required_tags: list[str] = []
    question: str | None = None
    session_id: str | None = None


class HintRequest(BaseModel):
    step_id: str
    step_title: str
    step_instructions: str
    student_code: str
    language: str = "html"
    required_tags: list[str] = []
    error_output: str = ""
    hints_already_given: int = 0
    previous_hints: list[str] = []
    attempt_number: int = 0
    session_id: str | None = None


class GenerateQuizRequest(BaseModel):
    tp_id: str
    tp_title: str
    tp_description: str
    step_titles: list[str]
    student_code: str
    num_questions: int = 4
    session_id: str | None = None


class QuizQuestion(BaseModel):
    question: str
    options: list[str]
    correctIndex: int
    explanation: str


class EvaluateAnswersRequest(BaseModel):
    tp_id: str
    tp_title: str
    questions: list[QuizQuestion]
    student_answers: list[int]
    student_code: str
    session_id: str | None = None


class OrchestrateRequest(BaseModel):
    action: str
    context: dict[str, Any]
    session_id: str | None = None


class GenerateTPRequest(BaseModel):
    prompt: str = ""
    # The programming language is the highest-priority constraint.
    prog_language: str = "python"
    # Prose language of the generated text (fr / en).
    ui_language: str = "fr"
    difficulty: str = "intermediate"
    step_count: int = 4
    questions_per_step: int = 2
    file_names: list[str] = []
    course_ids: list[str] = []
    session_id: str | None = None


class EnhanceTPRequest(BaseModel):
    tp: dict[str, Any]
    prog_language: str = "python"
    ui_language: str = "fr"
    instructions: str | None = None
    session_id: str | None = None


class RegenerateSectionRequest(BaseModel):
    section: str
    tp: dict[str, Any]
    prog_language: str = "python"
    ui_language: str = "fr"
    difficulty: str = "intermediate"
    step_count: int = 4
    questions_per_step: int = 2
    session_id: str | None = None


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _proxy(method: str, url: str, payload: dict) -> dict:
    """Proxy a request to an agent service with error handling."""
    try:
        with httpx.Client(timeout=TIMEOUT) as client:
            resp = getattr(client, method)(url, json=payload)
            resp.raise_for_status()
            return resp.json()
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail=f"Agent service unreachable: {url}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _aproxy(method: str, url: str, payload: dict | None = None) -> dict:
    """Async proxy to a downstream agent service, preserving error semantics."""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await getattr(client, method)(url, json=payload) if payload is not None \
                else await getattr(client, method)(url)
            resp.raise_for_status()
            return resp.json()
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail=f"Agent service unreachable: {url}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "agent-gateway"}


@app.get("/agents/health")
async def agents_health():
    """Check health of all downstream agent services."""
    statuses = {}
    urls = {
        "explanation-agent": f"{EXPLANATION_AGENT_URL}/health",
        "hint-agent": f"{HINT_AGENT_URL}/health",
        "evaluation-agent": f"{EVALUATION_AGENT_URL}/health",
        "orchestrator": f"{ORCHESTRATOR_URL}/health",
        "creator-agent": f"{CREATOR_AGENT_URL}/health",
        "rag-service": f"{RAG_SERVICE_URL}/health",
    }
    async with httpx.AsyncClient(timeout=5.0) as client:
        for name, url in urls.items():
            try:
                resp = await client.get(url)
                statuses[name] = "up" if resp.status_code == 200 else "degraded"
            except Exception:
                statuses[name] = "down"
    return {"agents": statuses}


OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")


async def _probe(client: httpx.AsyncClient, name: str, url: str, kind: str) -> dict:
    """Ping a dependency once and return its status + round-trip latency."""
    started = time.monotonic()
    try:
        resp = await client.get(url)
        ms = round((time.monotonic() - started) * 1000)
        ok = resp.status_code == 200
        info: dict[str, Any] = {}
        if ok and "application/json" in resp.headers.get("content-type", ""):
            body = resp.json()
            if isinstance(body, dict):
                info = {k: body[k] for k in ("model", "service", "vector_store") if k in body}
        return {"name": name, "kind": kind, "status": "up" if ok else "degraded",
                "latency_ms": ms, "url": url, **info}
    except Exception as e:  # noqa: BLE001
        return {"name": name, "kind": kind, "status": "down",
                "latency_ms": round((time.monotonic() - started) * 1000),
                "url": url, "error": str(e)[:160]}


def _sandbox_status() -> dict:
    """Report the active sandbox provider's status without an HTTP round-trip for
    the local provider (it lists which languages can actually run here)."""
    if SANDBOX_PROVIDER == "piston":
        return {}  # probed over HTTP below
    avail = local_sandbox.supported_languages()
    runnable = sorted(k for k, v in avail.items() if v)
    return {
        "name": "sandbox (local)", "kind": "sandbox",
        "status": "up" if runnable else "degraded", "latency_ms": 0,
        "url": "in-process", "model": f"{len(runnable)} languages: {', '.join(runnable) or 'none installed'}",
    }


@app.get("/api/agents/status")
async def platform_status():
    """
    Aggregated health for the admin/debug panel: every agent, the LLM backend
    (Ollama) and the code-execution sandbox, each with latency.
    """
    targets = [
        ("agent-gateway", f"http://localhost:{os.getenv('AGENT_GATEWAY_PORT', '8000')}/health", "gateway"),
        ("creator-agent", f"{CREATOR_AGENT_URL}/health", "llm-agent"),
        ("hint-agent", f"{HINT_AGENT_URL}/health", "llm-agent"),
        ("explanation-agent", f"{EXPLANATION_AGENT_URL}/health", "llm-agent"),
        ("evaluation-agent", f"{EVALUATION_AGENT_URL}/health", "llm-agent"),
        ("orchestrator", f"{ORCHESTRATOR_URL}/health", "llm-agent"),
        ("validation-service", f"{VALIDATION_SERVICE_URL}/health", "validation"),
        ("rag-service", f"{RAG_SERVICE_URL}/health", "rag"),
        ("ollama", f"{OLLAMA_BASE_URL}/api/tags", "llm-backend"),
    ]
    if SANDBOX_PROVIDER == "piston":
        targets.append(("sandbox (piston)", f"{PISTON_URL}/runtimes", "sandbox"))
    async with httpx.AsyncClient(timeout=6.0) as client:
        services = list(await asyncio.gather(*[_probe(client, n, u, k) for n, u, k in targets]))
    if SANDBOX_PROVIDER != "piston":
        services.append(_sandbox_status())
    overall = "ok" if all(s["status"] == "up" for s in services) else (
        "degraded" if any(s["status"] == "up" for s in services) else "down")
    return {"overall": overall, "provider": SANDBOX_PROVIDER,
            "checked_at": datetime.now(timezone.utc).isoformat(), "services": services}


@app.post("/api/agents/explain")
async def explain(req: ExplainRequest):
    """Route to Explanation Agent (Mistral)."""
    result = _proxy("post", f"{EXPLANATION_AGENT_URL}/explain", req.model_dump())
    await events.emit_interaction(
        "explain", "explanation-agent", req.session_id,
        {"tpId": req.tp_id, "stepId": req.step_id},
    )
    return result


@app.post("/api/agents/hint")
async def hint(req: HintRequest):
    """Route to Hint Agent (deepseek-coder:6.7b via Ollama)."""
    result = _proxy("post", f"{HINT_AGENT_URL}/hint", req.model_dump())
    await events.emit_interaction(
        "hint", "hint-agent", req.session_id,
        {"stepId": req.step_id, "hintLevel": req.hints_already_given + 1},
    )
    return result


@app.post("/api/agents/generate-quiz")
async def generate_quiz(req: GenerateQuizRequest):
    """Route to Evaluation Agent — generate quiz questions."""
    result = _proxy("post", f"{EVALUATION_AGENT_URL}/generate-quiz", req.model_dump())
    await events.emit_interaction(
        "generate_quiz", "evaluation-agent", req.session_id,
        {"tpId": req.tp_id, "numQuestions": req.num_questions},
    )
    return result


@app.post("/api/agents/evaluate")
async def evaluate(req: EvaluateAnswersRequest):
    """Route to Evaluation Agent — score quiz answers."""
    result = _proxy("post", f"{EVALUATION_AGENT_URL}/evaluate", req.model_dump())
    await events.emit_interaction(
        "evaluate", "evaluation-agent", req.session_id,
        {"tpId": req.tp_id, "numQuestions": len(req.questions)},
    )
    await events.bus.emit(
        events.TOPIC_QUIZ_COMPLETED,
        {
            "sessionId": req.session_id,
            "tpId": req.tp_id,
            "tpTitle": req.tp_title,
            "score": result.get("score"),
            "numQuestions": len(req.questions),
        },
        key=req.session_id,
    )
    return result


@app.post("/api/agents/orchestrate")
async def orchestrate(req: OrchestrateRequest):
    """Route complex/ambiguous requests to the DeepSeek v3 Orchestrator."""
    return _proxy("post", f"{ORCHESTRATOR_URL}/orchestrate", req.model_dump())



async def _retrieve_rag_context(prompt: str, course_ids: list[str]) -> list[dict]:
    """Pull retrieval context from the RAG service; degrade gracefully if down."""
    if not course_ids:
        return []
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{RAG_SERVICE_URL}/api/rag/search",
                json={"query": prompt or "course content", "course_ids": course_ids, "k": 6},
            )
            resp.raise_for_status()
            hits = resp.json().get("results", [])
        return [
            {"name": h["course_name"], "excerpt": h["content"], "score": h["score"]}
            for h in hits
        ]
    except Exception as e:  # noqa: BLE001
        print(f"[agent-gateway] RAG retrieval failed: {e}")
        return []


@app.get("/api/agents/languages")
async def supported_languages():
    """List the programming languages the Creator Agent supports."""
    return await _aproxy("get", f"{CREATOR_AGENT_URL}/languages")


@app.post("/api/agents/generate-tp")
async def generate_tp(req: GenerateTPRequest):
    """
    Route TP generation to the Creator Agent (qwen2.5-coder).

    The gateway gathers RAG context from indexed courses and forwards the request;
    the Creator Agent returns a structured, university-level draft (status="draft")
    ready for the teacher's Human-in-the-Loop review. A 5xx from the agent lets the
    frontend fall back to its local, language-aware draft builder.
    """
    rag_context = await _retrieve_rag_context(req.prompt, req.course_ids)
    body = {
        "prompt": req.prompt,
        "prog_language": req.prog_language,
        "ui_language": req.ui_language,
        "difficulty": req.difficulty,
        "step_count": req.step_count,
        "questions_per_step": req.questions_per_step,
        "rag_context": rag_context,
        "file_names": req.file_names,
        "session_id": req.session_id,
    }
    result = await _aproxy("post", f"{CREATOR_AGENT_URL}/generate", body)
    await events.emit_interaction(
        "generate_tp", "creator-agent", req.session_id,
        {"language": req.prog_language, "difficulty": req.difficulty},
    )
    return {**result, "used_rag": bool(rag_context)}


@app.post("/api/agents/enhance-tp")
async def enhance_tp(req: EnhanceTPRequest):
    """Route HITL refinement to the Creator Agent; result has status='enhanced'."""
    return await _aproxy("post", f"{CREATOR_AGENT_URL}/enhance", req.model_dump())


@app.post("/api/agents/regenerate-section")
async def regenerate_section(req: RegenerateSectionRequest):
    """Route single-section regeneration to the Creator Agent."""
    return await _aproxy("post", f"{CREATOR_AGENT_URL}/regenerate-section", req.model_dump())


# ─── Multi-language code execution (live display) ────────────────────────────

# Our language ids → candidate Piston runtime names (first available wins) and
# the source filename the runtime expects (matters for compiled languages).
_PISTON_LANGS: dict[str, dict[str, Any]] = {
    "python": {"names": ["python"], "file": "main.py"},
    "javascript": {"names": ["javascript", "node"], "file": "main.js"},
    "typescript": {"names": ["typescript"], "file": "main.ts"},
    "java": {"names": ["java"], "file": "Main.java"},
    "c": {"names": ["c"], "file": "main.c"},
    "cpp": {"names": ["c++", "cpp"], "file": "main.cpp"},
    "csharp": {"names": ["csharp", "csharp.net", "mono", "c#"], "file": "main.cs"},
    "php": {"names": ["php"], "file": "main.php"},
    "go": {"names": ["go"], "file": "main.go"},
    "rust": {"names": ["rust"], "file": "main.rs"},
    "kotlin": {"names": ["kotlin"], "file": "main.kt"},
    "dart": {"names": ["dart"], "file": "main.dart"},
}

_runtime_cache: dict[str, str] = {}  # piston language name → version

EXECUTABLE_LANGUAGES = sorted(_PISTON_LANGS.keys())
SANDBOX_RETRIES = int(os.getenv("SANDBOX_RETRIES", "2"))


class ExecuteRequest(BaseModel):
    language: str
    code: str
    stdin: str = ""


class SandboxError(Exception):
    """Carries a machine-readable `kind` so callers can give users a precise reason."""

    def __init__(self, kind: str, message: str, status: int = 502):
        super().__init__(message)
        self.kind = kind
        self.message = message
        self.status = status


async def _resolve_runtime(client: httpx.AsyncClient, names: list[str]) -> tuple[str, str]:
    """Resolve our candidate names to a (piston_language, version) Piston supports."""
    if not _runtime_cache:
        resp = await client.get(f"{PISTON_URL}/runtimes")
        resp.raise_for_status()
        for rt in resp.json():
            for key in [rt.get("language"), *rt.get("aliases", [])]:
                if key:
                    _runtime_cache[key] = rt.get("version", "*")
    for name in names:
        if name in _runtime_cache:
            return name, _runtime_cache[name]
    raise SandboxError("unsupported_language", f"No sandbox runtime for {names}", status=400)


async def _run_piston(language: str, code: str, stdin: str = "") -> dict:
    """
    Execute code in a (self-hosted) Piston sandbox. Returns a structured result
    with `kind` success|compile_error|runtime_error. Transient failures (connect
    errors, 429, 5xx) are retried with backoff.
    """
    lang = language.strip().lower()
    spec = _PISTON_LANGS.get(lang)
    if spec is None:
        raise SandboxError("unsupported_language", f"Execution not supported for '{language}'", status=400)

    last_exc: Exception | None = None
    for attempt in range(SANDBOX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(45.0, connect=10.0)) as client:
                piston_lang, version = await _resolve_runtime(client, spec["names"])
                resp = await client.post(
                    f"{PISTON_URL}/execute",
                    json={
                        "language": piston_lang,
                        "version": version,
                        "files": [{"name": spec["file"], "content": code}],
                        "stdin": stdin,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
            break
        except httpx.TimeoutException as e:
            last_exc = e
            logger.warning("sandbox timeout (attempt %d) lang=%s", attempt + 1, lang)
        except httpx.HTTPStatusError as e:
            last_exc = e
            # 429/5xx are transient; 4xx are not worth retrying.
            if e.response.status_code not in (429, 500, 502, 503, 504):
                raise SandboxError("sandbox_error", f"Sandbox rejected request: {e.response.text[:300]}", status=502)
            logger.warning("sandbox %s (attempt %d)", e.response.status_code, attempt + 1)
        except (httpx.ConnectError, httpx.ReadError) as e:
            last_exc = e
            logger.warning("sandbox unreachable (attempt %d): %s", attempt + 1, e)
        if attempt < SANDBOX_RETRIES:
            await asyncio.sleep(0.6 * (attempt + 1))
    else:
        if isinstance(last_exc, httpx.TimeoutException):
            raise SandboxError("timeout", "Code execution timed out in the sandbox.", status=504)
        raise SandboxError("sandbox_unreachable",
                           f"Could not reach the execution sandbox ({PISTON_URL}).", status=503)

    run = data.get("run", {}) or {}
    compile_ = data.get("compile", {}) or {}
    compile_out = (compile_.get("stderr", "") or compile_.get("output", "")).strip()
    exit_code = run.get("code", 0) or 0
    if compile_out and (compile_.get("code", 0) or 0) != 0:
        kind = "compile_error"
    elif exit_code != 0:
        kind = "runtime_error"
    else:
        kind = "success"
    return {
        "ok": kind == "success",
        "kind": kind,
        "language": lang,
        "version": data.get("version", ""),
        "stdout": run.get("stdout", "") or "",
        "stderr": run.get("stderr", "") or "",
        "output": run.get("output", "") or "",
        "compile_output": compile_out,
        "exit_code": exit_code,
    }


async def _run_local(language: str, code: str, stdin: str = "") -> dict:
    """Execute code with host toolchains (default provider). Off-loads the
    blocking subprocess work to a thread so the event loop stays responsive."""
    try:
        return await asyncio.to_thread(local_sandbox.run, language, code, stdin)
    except local_sandbox.LocalExecError as e:
        status = {"timeout": 504, "unsupported_language": 400}.get(e.kind, 502)
        raise SandboxError(e.kind, e.message, status=status)


async def run_in_sandbox(language: str, code: str, stdin: str = "") -> dict:
    """
    Run code in the configured sandbox provider and return a structured result
    with `kind` success|compile_error|runtime_error. Raises SandboxError
    (unsupported_language | timeout | sandbox_unreachable | sandbox_error) for
    infrastructure failures so the caller can report a precise cause.
    """
    if SANDBOX_PROVIDER == "piston":
        return await _run_piston(language, code, stdin)
    return await _run_local(language, code, stdin)


@app.post("/api/execute")
async def execute_code(req: ExecuteRequest):
    """
    Run student code in the sandbox and return its output — the per-language
    'live display'. Web (HTML/CSS) is rendered client-side and not executed here.
    Returns 200 with a `kind` of success/compile_error/runtime_error; raises a
    JSON error with `kind` (timeout/sandbox_unreachable/…) on infra failure.
    """
    started = time.monotonic()
    try:
        result = await run_in_sandbox(req.language, req.code, req.stdin)
    except SandboxError as e:
        logger.error("execute failed kind=%s lang=%s: %s", e.kind, req.language, e.message)
        raise HTTPException(status_code=e.status, detail={"kind": e.kind, "message": e.message})
    result["elapsed_ms"] = round((time.monotonic() - started) * 1000)
    logger.info("execute lang=%s kind=%s exit=%s %dms",
                result["language"], result["kind"], result["exit_code"], result["elapsed_ms"])
    return result



# ─── Real-time progress endpoints ────────────────────────────────────────────

class ProgressEvent(BaseModel):
    type: str = "progress"
    progress: dict[str, Any]


@app.post("/api/agents/progress")
async def publish_progress(event: ProgressEvent):
    """Students POST a progress snapshot here; it is fanned out to dashboards."""
    payload = {"type": event.type, "progress": event.progress,
               "at": datetime.now(timezone.utc).isoformat()}
    await manager.broadcast(payload)
    await events.bus.emit(events.TOPIC_PROGRESS, dict(payload),
                          key=str(event.progress.get("studentId") or ""))
    return {"delivered": len(manager.active)}


@app.websocket("/ws/progress")
async def progress_socket(ws: WebSocket):
    """Dashboards subscribe here to receive live student progress updates."""
    await manager.connect(ws)
    try:
        while True:
            # Clients may also push snapshots over the socket; relay them too.
            data = await ws.receive_json()
            data.setdefault("at", datetime.now(timezone.utc).isoformat())
            await manager.broadcast(data)
    except WebSocketDisconnect:
        manager.disconnect(ws)
    except Exception:  # noqa: BLE001
        manager.disconnect(ws)


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("AGENT_GATEWAY_PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
