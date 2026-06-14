"""
RAG Service — standalone FastAPI microservice.

Owns the complete retrieval-augmented-generation pipeline:
  course document upload → text extraction → chunking → embeddings (Ollama)
  → pgvector storage → similarity search.

Consumers:
  - frontend (teacher course library: upload / list / reindex / delete)
  - agent-gateway (retrieval context for TP generation, via POST /api/rag/search)
"""
import os
import json
import uuid
import shutil
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import rag

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../../.env"))

app = FastAPI(title="RAG Service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

RAG_READY = False

COURSES_FILE = os.path.join(os.path.dirname(__file__), "courses_store.json")
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "uploads")


@app.on_event("startup")
def _init_store() -> None:
    """Create the pgvector extension + table on boot. Degrades gracefully if down."""
    global RAG_READY
    try:
        rag.ensure_schema()
        RAG_READY = True
        print("[rag-service] vector store ready")
    except Exception as e:  # noqa: BLE001
        RAG_READY = False
        print(f"[rag-service] vector store unavailable: {e}")


# ─── Course store (metadata) ──────────────────────────────────────────────────

def _load_courses() -> list[dict]:
    if not os.path.exists(COURSES_FILE):
        return []
    with open(COURSES_FILE) as f:
        try:
            return json.load(f)
        except (json.JSONDecodeError, ValueError):
            return []


def _save_courses(courses: list[dict]) -> None:
    with open(COURSES_FILE, "w") as f:
        json.dump(courses, f, ensure_ascii=False, indent=2)


def _upsert_course(record: dict) -> None:
    courses = _load_courses()
    existing = next((i for i, c in enumerate(courses) if c.get("id") == record["id"]), None)
    if existing is not None:
        courses[existing] = record
    else:
        courses.append(record)
    _save_courses(courses)


def _index_document(cid: str, name: str, path: str, size: int) -> dict:
    """Run the RAG pipeline and return the updated course record."""
    record = {
        "id": cid,
        "name": name,
        "path": path,
        "size": size,
        "uploadedAt": datetime.now(timezone.utc).isoformat(),
        "status": "indexing",
        "chunks": 0,
        "excerpt": "",
    }
    if not RAG_READY:
        record["status"] = "error"
        record["error"] = "Vector store unavailable"
        _upsert_course(record)
        return record

    try:
        chunk_count = rag.ingest(cid, name, path)
        excerpt = rag.extract_text(path, name).strip()
        record["status"] = "indexed" if chunk_count > 0 else "error"
        record["chunks"] = chunk_count
        record["excerpt"] = excerpt[:500]
        if chunk_count == 0:
            record["error"] = "No extractable text found"
    except rag.RagUnavailable as e:
        record["status"] = "error"
        record["error"] = str(e)
    except Exception as e:  # noqa: BLE001
        record["status"] = "error"
        record["error"] = str(e)

    _upsert_course(record)
    return record


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "rag-service", "vector_store": RAG_READY}


@app.get("/api/rag/courses")
def list_courses():
    """List all uploaded course documents."""
    return {"courses": _load_courses()}


@app.post("/api/rag/courses/upload")
async def upload_course(
    file: UploadFile = File(...),
    course_id: str = Form(default=""),
):
    """
    Accept a PDF/DOCX/TXT/MD course file, persist it, then embed + store its
    chunks in the pgvector store so the agents can retrieve from it.
    """
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    cid = course_id or str(uuid.uuid4())
    safe_name = file.filename or f"document-{cid}"
    dest = os.path.join(UPLOADS_DIR, f"{cid}_{safe_name}")

    with open(dest, "wb") as out:
        shutil.copyfileobj(file.file, out)

    file_size = os.path.getsize(dest)
    record = _index_document(cid, safe_name, dest, file_size)

    if record["status"] == "error":
        return {"course": record, "message": f"Indexing failed: {record.get('error', 'unknown error')}"}
    return {"course": record, "message": f"Document indexed: {record['chunks']} chunks embedded"}


@app.post("/api/rag/courses/{course_id}/reindex")
def reindex_course(course_id: str):
    """Re-run the embedding pipeline on an already uploaded document."""
    record = next((c for c in _load_courses() if c.get("id") == course_id), None)
    if not record:
        raise HTTPException(status_code=404, detail="Course not found")
    path = record.get("path")
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=410, detail="Source file no longer available")
    updated = _index_document(course_id, record["name"], path, record.get("size", os.path.getsize(path)))
    return {"course": updated}


@app.delete("/api/rag/courses/{course_id}")
def delete_course(course_id: str):
    """Remove a course document and its vectors from the store."""
    courses = _load_courses()
    record = next((c for c in courses if c.get("id") == course_id), None)
    if not record:
        raise HTTPException(status_code=404, detail="Course not found")
    if record.get("path") and os.path.exists(record["path"]):
        os.remove(record["path"])
    if RAG_READY:
        try:
            rag.delete(course_id)
        except Exception as e:  # noqa: BLE001
            print(f"[rag-service] failed to drop vectors for {course_id}: {e}")
    _save_courses([c for c in courses if c.get("id") != course_id])
    return {"deleted": course_id}


class SearchRequest(BaseModel):
    query: str
    course_ids: list[str] = []
    k: int = 5


@app.post("/api/rag/search")
def search(req: SearchRequest):
    """Vector similarity search across indexed course chunks."""
    if not RAG_READY:
        raise HTTPException(status_code=503, detail="Vector store unavailable")
    try:
        results = rag.search(req.query, course_ids=req.course_ids or None, k=req.k)
    except rag.RagUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"results": results}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("RAG_SERVICE_PORT", 8005))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
