"""
Vector pipeline for the standalone RAG Service:

  document  →  text extraction (PDF / DOCX / TXT / MD)
            →  chunking
            →  embeddings (Ollama)
            →  pgvector storage  (table: rag_chunks)
            →  cosine-similarity retrieval

All configuration is environment driven so it works both in Docker and for a
local `start.sh` run:

  RAG_DATABASE_URL   postgresql://postgres:postgres@localhost:5432/rag_db
  OLLAMA_BASE_URL    http://localhost:11434
  RAG_EMBED_MODEL    nomic-embed-text
  RAG_EMBED_DIM      768
  RAG_CHUNK_SIZE     1000
  RAG_CHUNK_OVERLAP  150
"""
from __future__ import annotations

import os
import re
from urllib.parse import urlsplit, urlunsplit

import httpx
import psycopg

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
EMBED_MODEL = os.getenv("RAG_EMBED_MODEL", "nomic-embed-text")
EMBED_DIM = int(os.getenv("RAG_EMBED_DIM", "768"))
CHUNK_SIZE = int(os.getenv("RAG_CHUNK_SIZE", "1000"))
CHUNK_OVERLAP = int(os.getenv("RAG_CHUNK_OVERLAP", "150"))

DATABASE_URL = os.getenv(
    "RAG_DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/rag_db",
)


class RagUnavailable(RuntimeError):
    """Raised when the vector store or embedding backend cannot be reached."""


# ─── Database bootstrap ─────────────────────────────────────────────────────

def _ensure_database() -> None:
    """Create the target database if it does not exist yet (local dev convenience)."""
    parts = urlsplit(DATABASE_URL)
    db_name = parts.path.lstrip("/") or "rag_db"
    admin_url = urlunsplit(parts._replace(path="/postgres"))
    try:
        with psycopg.connect(admin_url, autocommit=True, connect_timeout=5) as conn:
            exists = conn.execute(
                "SELECT 1 FROM pg_database WHERE datname = %s", (db_name,)
            ).fetchone()
            if not exists:
                conn.execute(f'CREATE DATABASE "{db_name}"')
    except Exception:
        # If we can't connect to the admin DB (e.g. managed Postgres), assume
        # the target database already exists and let _ensure_schema surface errors.
        pass


def ensure_schema() -> None:
    """Create the pgvector extension and the rag_chunks table. Idempotent."""
    _ensure_database()
    with psycopg.connect(DATABASE_URL, connect_timeout=5) as conn:
        conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS rag_chunks (
                id          BIGSERIAL PRIMARY KEY,
                course_id   TEXT NOT NULL,
                course_name TEXT NOT NULL,
                chunk_index INT  NOT NULL,
                content     TEXT NOT NULL,
                embedding   vector({EMBED_DIM}) NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS rag_chunks_course_idx ON rag_chunks (course_id)"
        )
        conn.commit()


def is_available() -> bool:
    try:
        with psycopg.connect(DATABASE_URL, connect_timeout=3) as conn:
            conn.execute("SELECT 1")
        return True
    except Exception:
        return False


# ─── Text extraction ────────────────────────────────────────────────────────

def extract_text(path: str, name: str) -> str:
    lower = name.lower()
    if lower.endswith(".pdf"):
        return _extract_pdf(path)
    if lower.endswith(".docx"):
        return _extract_docx(path)
    # txt, md and everything else: read as text
    with open(path, encoding="utf-8", errors="ignore") as f:
        return f.read()


def _extract_pdf(path: str) -> str:
    from pypdf import PdfReader

    reader = PdfReader(path)
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _extract_docx(path: str) -> str:
    import docx

    document = docx.Document(path)
    return "\n".join(p.text for p in document.paragraphs)


# ─── Chunking ───────────────────────────────────────────────────────────────

def chunk_text(text: str) -> list[str]:
    """Split on paragraph boundaries, packing into ~CHUNK_SIZE windows with overlap."""
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if not text:
        return []

    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current = ""
    for para in paragraphs:
        if len(current) + len(para) + 2 <= CHUNK_SIZE:
            current = f"{current}\n\n{para}" if current else para
        else:
            if current:
                chunks.append(current)
            if len(para) <= CHUNK_SIZE:
                current = para
            else:
                # Hard-split very long paragraphs.
                for i in range(0, len(para), CHUNK_SIZE - CHUNK_OVERLAP):
                    chunks.append(para[i : i + CHUNK_SIZE])
                current = ""
    if current:
        chunks.append(current)
    return chunks


# ─── Embeddings (Ollama) ────────────────────────────────────────────────────

def _embed(text: str) -> list[float]:
    try:
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(
                f"{OLLAMA_BASE_URL}/api/embeddings",
                json={"model": EMBED_MODEL, "prompt": text},
            )
            resp.raise_for_status()
            embedding = resp.json().get("embedding")
    except Exception as e:  # noqa: BLE001
        raise RagUnavailable(f"Embedding backend unreachable: {e}") from e

    if not embedding:
        raise RagUnavailable("Embedding backend returned an empty vector")
    return embedding


def _vector_literal(values: list[float]) -> str:
    return "[" + ",".join(repr(float(v)) for v in values) + "]"


# ─── Ingestion / retrieval ──────────────────────────────────────────────────

def ingest(course_id: str, course_name: str, path: str) -> int:
    """(Re)index a document. Returns the number of chunks stored."""
    text = extract_text(path, course_name)
    chunks = chunk_text(text)
    if not chunks:
        # Still clear any previous version so the store stays consistent.
        delete(course_id)
        return 0

    rows = [(i, c, _vector_literal(_embed(c))) for i, c in enumerate(chunks)]

    with psycopg.connect(DATABASE_URL, connect_timeout=10) as conn:
        conn.execute("DELETE FROM rag_chunks WHERE course_id = %s", (course_id,))
        with conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO rag_chunks (course_id, course_name, chunk_index, content, embedding) "
                "VALUES (%s, %s, %s, %s, %s::vector)",
                [(course_id, course_name, i, content, vec) for i, content, vec in rows],
            )
        conn.commit()
    return len(rows)


def search(query: str, course_ids: list[str] | None = None, k: int = 5) -> list[dict]:
    """Return the top-k most similar chunks (lower distance = more similar)."""
    qvec = _vector_literal(_embed(query))
    sql = (
        "SELECT course_id, course_name, content, "
        "       embedding <=> %s::vector AS distance "
        "FROM rag_chunks "
    )
    params: list = [qvec]
    if course_ids:
        sql += "WHERE course_id = ANY(%s) "
        params.append(list(course_ids))
    sql += "ORDER BY distance ASC LIMIT %s"
    params.append(k)

    with psycopg.connect(DATABASE_URL, connect_timeout=10) as conn:
        rows = conn.execute(sql, params).fetchall()

    return [
        {
            "course_id": r[0],
            "course_name": r[1],
            "content": r[2],
            "score": round(1.0 - float(r[3]), 4),
        }
        for r in rows
    ]


def delete(course_id: str) -> None:
    with psycopg.connect(DATABASE_URL, connect_timeout=10) as conn:
        conn.execute("DELETE FROM rag_chunks WHERE course_id = %s", (course_id,))
        conn.commit()


def count_chunks(course_id: str) -> int:
    with psycopg.connect(DATABASE_URL, connect_timeout=10) as conn:
        row = conn.execute(
            "SELECT COUNT(*) FROM rag_chunks WHERE course_id = %s", (course_id,)
        ).fetchone()
    return int(row[0]) if row else 0
