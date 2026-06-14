"""
Creator Agent — TP (Travaux Pratiques) generation agent.

A dedicated AI agent that designs university-level, language-specific practical
assignments. It is powered by a code-specialised model (qwen2.5-coder by default)
served through Ollama, and is the single owner of:

  * full TP draft generation,
  * AI-assisted refinement ("enhance") that preserves teacher edits,
  * per-section regeneration.

The agent-gateway proxies to this service (it retrieves RAG context and forwards
it here). Keeping generation in its own agent — like the explanation / hint /
evaluation agents — lets it use a model tuned for code without affecting the
other agents.
"""
import os
import json
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../../.env"))

from tp_generation import (
    LANGUAGES,
    language_profile,
    build_generation_messages,
    build_enhance_messages,
    build_section_messages,
    normalize_tp,
    normalize_steps,
    normalize_quiz,
    normalize_criteria,
)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
CREATOR_MODEL = os.getenv("CREATOR_AGENT_MODEL", "qwen2.5-coder:latest")
TIMEOUT = httpx.Timeout(180.0, connect=10.0)

app = FastAPI(title="Creator Agent", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Models ───────────────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    prompt: str = ""
    prog_language: str = "python"
    ui_language: str = "fr"
    difficulty: str = "intermediate"
    step_count: int = 4
    questions_per_step: int = 2
    rag_context: list[dict[str, Any]] = []
    file_names: list[str] = []
    session_id: str | None = None


class EnhanceRequest(BaseModel):
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


# ─── Ollama ───────────────────────────────────────────────────────────────────

async def _chat_json(messages: list[dict], *, temperature: float = 0.4) -> dict:
    """Call Ollama's chat API forcing JSON output and parse the result."""
    payload = {
        "model": CREATOR_MODEL,
        "messages": messages,
        "stream": False,
        "format": "json",
        "options": {"temperature": temperature},
    }
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload)
            resp.raise_for_status()
            content = resp.json().get("message", {}).get("content", "")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"LLM backend error: {e.response.text}")
    except Exception as e:  # noqa: BLE001 — connection/timeout/etc.
        raise HTTPException(status_code=503, detail=f"LLM backend unreachable: {e}")
    try:
        return json.loads(content)
    except (json.JSONDecodeError, TypeError):
        raise HTTPException(status_code=502, detail="LLM returned non-JSON output")


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "creator-agent", "model": CREATOR_MODEL}


@app.get("/languages")
def languages():
    """Programming languages this agent can author TPs for."""
    return {"languages": [{"id": l["id"], "label": l["label"]} for l in LANGUAGES]}


@app.post("/generate")
async def generate(req: GenerateRequest):
    """Generate a complete, language-specific TP draft (status='draft')."""
    profile = language_profile(req.prog_language)
    messages = build_generation_messages(
        prompt=req.prompt,
        profile=profile,
        ui_language=req.ui_language,
        difficulty=req.difficulty,
        step_count=req.step_count,
        questions_per_step=req.questions_per_step,
        context={"rag_context": req.rag_context, "file_names": req.file_names},
    )
    raw = await _chat_json(messages)
    tp = normalize_tp(raw, profile=profile, difficulty=req.difficulty, status="draft")
    return {"tp": tp, "agent": "creator-agent", "model": CREATOR_MODEL}


@app.post("/enhance")
async def enhance(req: EnhanceRequest):
    """Refine a teacher-reviewed draft, preserving edits (status='enhanced')."""
    profile = language_profile(req.prog_language or req.tp.get("language"))
    messages = build_enhance_messages(
        tp=req.tp, profile=profile, ui_language=req.ui_language, instructions=req.instructions,
    )
    raw = await _chat_json(messages, temperature=0.3)
    difficulty = str(req.tp.get("difficulty") or "intermediate")
    tp = normalize_tp(raw, profile=profile, difficulty=difficulty, status="enhanced")
    return {"tp": tp, "agent": "creator-agent", "model": CREATOR_MODEL}


@app.post("/regenerate-section")
async def regenerate_section(req: RegenerateSectionRequest):
    """Regenerate a single section of the draft without touching the rest."""
    profile = language_profile(req.prog_language or req.tp.get("language"))
    messages = build_section_messages(
        section=req.section,
        tp=req.tp,
        profile=profile,
        ui_language=req.ui_language,
        difficulty=req.difficulty,
        step_count=req.step_count,
        questions_per_step=req.questions_per_step,
    )
    raw = await _chat_json(messages, temperature=0.5)
    value = raw.get("value") if isinstance(raw, dict) else None
    if req.section == "steps":
        value = normalize_steps(value)
    elif req.section == "quiz":
        value = [normalize_quiz(q) for q in (value or [])]
    elif req.section == "evaluationCriteria":
        value = normalize_criteria(value)
    return {"section": req.section, "value": value, "agent": "creator-agent", "model": CREATOR_MODEL}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("CREATOR_AGENT_PORT", 8007))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
