"""
Hint Agent — intelligent, language-aware, progressive coding hints.

Rewritten to use the LLM directly (Ollama chat API) instead of langgraph's
`create_react_agent`, which fails because the deprecated community ChatOllama
does not implement `bind_tools`. The agent now reasons over the FULL context of
a submission — code, the current compiler/runtime errors, the TP requirements,
the student's attempt count and every hint already given — and returns a single
progressive hint that never repeats earlier ones and never reveals the solution.

Hint levels (escalate with hints already given):
  1 — very subtle nudge (conceptual)
  2 — more targeted (where to look / which construct family)
  3 — strong guidance, still without writing the solution
"""
import os
import re
import json
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../../.env"))

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
HINT_MODEL = os.getenv("HINT_AGENT_MODEL", "deepseek-coder:6.7b")
TIMEOUT = httpx.Timeout(120.0, connect=10.0)

app = FastAPI(title="Hint Agent", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SYSTEM_PROMPT = """You are an experienced teaching assistant helping an engineering student with a
programming lab (TP). You give ONE hint at a time, tuned to the student's current code, the errors
they're seeing, and the hints they've already received.

ABSOLUTE RULES:
- Give exactly ONE hint. Be specific to THIS student's code, not generic advice.
- NEVER write the solution or a code snippet that completes the task. You may name a concept,
  function, or construct, but never hand over working code for the required logic.
- NEVER repeat (even reworded) any hint already given — read the "Hints already given" list and go
  strictly further than the last one.
- Reference what the student already did correctly, then point at the single most useful next move.
- If the code looks correct and complete, say so and tell them to run/submit.
- Keep it to 2-4 sentences and end with one short question that nudges their thinking.
- Use terminology of the TARGET LANGUAGE (idioms, stdlib, tooling) — never assume HTML/web.

PROGRESSION (use the requested level):
- Level 1: a subtle conceptual nudge about what's missing or wrong.
- Level 2: more targeted — point at the area/line/construct family to investigate.
- Level 3: strong guidance — name the exact construct/approach and how to apply it, but still WITHOUT
  writing the solution code.

Return ONLY JSON: {"hint": string, "level": 1|2|3}"""


class HintRequest(BaseModel):
    step_id: str = ""
    step_title: str = ""
    step_instructions: str = ""
    student_code: str = ""
    language: str = "html"
    required_tags: list[str] = []
    error_output: str = ""          # compiler/runtime/test errors from the sandbox
    hints_already_given: int = 0
    previous_hints: list[str] = []
    attempt_number: int = 0         # failed run count, drives urgency
    session_id: str | None = None


class HintResponse(BaseModel):
    hint: str
    hint_level: int
    validation_passed: bool
    missing_tags: list[str]
    agent: str = "hint-agent"
    model: str


def _present(code: str, keyword: str) -> bool:
    """Token-aware: `int` must not match inside `print`; symbolic keywords use substring."""
    kw = (keyword or "").strip()
    if not kw:
        return True
    if re.fullmatch(r"\w+", kw):
        return re.search(rf"(?<!\w){re.escape(kw)}(?!\w)", code, re.IGNORECASE) is not None
    return kw.lower() in code.lower()


def _missing(code: str, required: list[str]) -> list[str]:
    return [t for t in required if t and not _present(code, t)]


@app.get("/health")
def health():
    return {"status": "ok", "agent": "hint-agent", "model": HINT_MODEL}


@app.post("/hint", response_model=HintResponse)
async def get_hint(req: HintRequest):
    level = max(1, min(3, req.hints_already_given + 1))
    missing = _missing(req.student_code, req.required_tags)
    prev = "\n".join(f"  {i + 1}. {h}" for i, h in enumerate(req.previous_hints)) or "  (none yet)"
    req_label = "required HTML tags" if req.language.lower() in {"html", "css", "web"} else "required concepts/keywords"

    user = (
        f"TARGET LANGUAGE: {req.language}\n"
        f"TP STEP: {req.step_title}\n"
        f"INSTRUCTIONS: {req.step_instructions}\n"
        f"{req_label}: {', '.join(req.required_tags) or '(none specified)'}\n"
        f"Still missing from the code: {', '.join(missing) or '(none missing)'}\n\n"
        f"STUDENT'S CURRENT CODE:\n```{req.language}\n{req.student_code or '(empty)'}\n```\n\n"
        f"CURRENT ERRORS (compiler/runtime/failed tests):\n{req.error_output.strip() or '(none reported)'}\n\n"
        f"Failed run attempts so far: {req.attempt_number}\n"
        f"Hints already given ({req.hints_already_given}):\n{prev}\n\n"
        f"Produce hint LEVEL {level}. It MUST be different from and go further than every hint above, "
        f"and must be specific to the code and errors shown."
    )

    payload = {
        "model": HINT_MODEL,
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}],
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.45},
    }
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload)
            resp.raise_for_status()
            content = resp.json().get("message", {}).get("content", "")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"LLM backend error: {e.response.text}")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"LLM backend unreachable: {e}")

    hint_text = ""
    try:
        data = json.loads(content)
        hint_text = str(data.get("hint", "")).strip()
        if str(data.get("level", "")).isdigit():
            level = int(data["level"])
    except (json.JSONDecodeError, TypeError, ValueError):
        hint_text = content.strip()
    if not hint_text:
        raise HTTPException(status_code=502, detail="Hint model returned an empty hint")

    return HintResponse(
        hint=hint_text,
        hint_level=max(1, min(3, level)),
        validation_passed=len(missing) == 0,
        missing_tags=missing,
        model=HINT_MODEL,
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("HINT_AGENT_PORT", 8002))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
