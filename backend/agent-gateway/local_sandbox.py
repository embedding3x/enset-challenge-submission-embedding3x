"""
Local execution backend — runs student code with the toolchains installed on the
host. This makes the platform self-contained: it no longer depends on the public
Piston API (whitelist-only since 2026-02-15).

It is one of two pluggable sandbox providers (see SANDBOX_PROVIDER in main.py):
  local   — subprocess execution with host compilers/interpreters (this module)
  piston  — a self-hosted Piston instance (HTTP), recommended for shared/prod use

SECURITY NOTE: this runs untrusted code directly on the host with only a timeout
and a temp working directory. That is acceptable for a single-user dev/lab
machine. For any multi-user or production deployment, run a self-hosted, isolated
Piston instead (SANDBOX_PROVIDER=piston).
"""
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from typing import Callable

LOCAL_EXEC_TIMEOUT = int(os.getenv("LOCAL_EXEC_TIMEOUT", "12"))


class LocalExecError(Exception):
    """kind: unsupported_language | timeout | sandbox_error"""

    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind
        self.message = message


def _which(*names: str) -> str | None:
    for n in names:
        p = shutil.which(n)
        if p:
            return p
    return None


# Each spec resolves the tool(s) it needs and returns (compile_cmd|None, run_cmd).
# `compile_cmd` failing (non-zero) is reported as a compile_error; otherwise a
# non-zero run is a runtime_error.
def _python(_wd: str):
    exe = _which("python3", "python")
    if not exe:
        raise LocalExecError("unsupported_language", "Python is not installed (need `python3`).")
    return None, [exe, "main.py"], "main.py"


def _node(_wd: str):
    exe = _which("node")
    if not exe:
        raise LocalExecError("unsupported_language", "JavaScript needs Node.js (`node`).")
    return None, [exe, "main.js"], "main.js"


def _typescript(_wd: str):
    tsnode = _which("ts-node", "tsx")
    if tsnode:
        return None, [tsnode, "main.ts"], "main.ts"
    tsc, node = _which("tsc"), _which("node")
    if tsc and node:
        # compile to JS then run; tsc emits main.js next to main.ts
        return [tsc, "main.ts", "--outDir", "."], [node, "main.js"], "main.ts"
    raise LocalExecError("unsupported_language", "TypeScript needs `ts-node`/`tsx`, or `tsc`+`node`.")


def _php(_wd: str):
    exe = _which("php")
    if not exe:
        raise LocalExecError("unsupported_language", "PHP is not installed (`php`).")
    return None, [exe, "main.php"], "main.php"


def _dart(_wd: str):
    exe = _which("dart")
    if not exe:
        raise LocalExecError("unsupported_language", "Dart is not installed (`dart`).")
    return None, [exe, "run", "main.dart"], "main.dart"


def _go(_wd: str):
    exe = _which("go")
    if not exe:
        raise LocalExecError("unsupported_language", "Go is not installed (`go`).")
    return None, [exe, "run", "main.go"], "main.go"


def _c(_wd: str):
    cc = _which("gcc", "clang", "cc")
    if not cc:
        raise LocalExecError("unsupported_language", "C needs `gcc`/`clang`.")
    return [cc, "main.c", "-o", "app", "-lm"], ["./app"], "main.c"


def _cpp(_wd: str):
    cxx = _which("g++", "clang++")
    if not cxx:
        raise LocalExecError("unsupported_language", "C++ needs `g++`/`clang++`.")
    return [cxx, "main.cpp", "-o", "app", "-std=c++17"], ["./app"], "main.cpp"


def _java(_wd: str):
    javac, java = _which("javac"), _which("java")
    if not (javac and java):
        raise LocalExecError("unsupported_language", "Java needs the JDK (`javac` + `java`).")
    # Student/starter code must declare `public class Main`.
    return [javac, "Main.java"], [java, "Main"], "Main.java"


def _rust(_wd: str):
    rustc = _which("rustc")
    if not rustc:
        raise LocalExecError("unsupported_language", "Rust needs `rustc`.")
    return [rustc, "main.rs", "-o", "app"], ["./app"], "main.rs"


def _kotlin(_wd: str):
    kotlinc, java = _which("kotlinc"), _which("java")
    if not (kotlinc and java):
        raise LocalExecError("unsupported_language", "Kotlin needs `kotlinc` + `java`.")
    return [kotlinc, "main.kt", "-include-runtime", "-d", "app.jar"], [java, "-jar", "app.jar"], "main.kt"


def _csharp(_wd: str):
    mcs, mono = _which("mcs", "csc"), _which("mono")
    if mcs and mono:
        return [mcs, "main.cs", "-out:app.exe"], [mono, "app.exe"], "main.cs"
    raise LocalExecError("unsupported_language", "C# needs `mono`+`mcs` (or a self-hosted Piston).")


def _ruby(_wd: str):
    exe = _which("ruby")
    if not exe:
        raise LocalExecError("unsupported_language", "Ruby is not installed (`ruby`).")
    return None, [exe, "main.rb"], "main.rb"


# Canonical language id → builder. Aliases normalised in `run`.
_BUILDERS: dict[str, Callable[[str], tuple[list[str] | None, list[str], str]]] = {
    "python": _python,
    "javascript": _node,
    "typescript": _typescript,
    "php": _php,
    "dart": _dart,
    "go": _go,
    "c": _c,
    "cpp": _cpp,
    "java": _java,
    "rust": _rust,
    "kotlin": _kotlin,
    "csharp": _csharp,
    "ruby": _ruby,
}

_ALIASES = {"js": "javascript", "node": "javascript", "ts": "typescript",
            "py": "python", "c++": "cpp", "cs": "csharp"}


def _norm(language: str) -> str:
    lang = (language or "").strip().lower()
    return _ALIASES.get(lang, lang)


def supported_languages() -> dict[str, bool]:
    """Which languages can actually run here right now (toolchain installed)."""
    out: dict[str, bool] = {}
    for lang, builder in _BUILDERS.items():
        try:
            builder("")
            out[lang] = True
        except LocalExecError:
            out[lang] = False
    return out


def _exec(workdir: str, cmd: list[str], stdin: str, timeout: int) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(
            cmd, cwd=workdir, input=stdin, capture_output=True, text=True,
            timeout=timeout, env={**os.environ, "PATH": os.environ.get("PATH", "")},
        )
    except subprocess.TimeoutExpired:
        raise LocalExecError("timeout", f"Execution exceeded {timeout}s and was killed.")
    except FileNotFoundError as e:
        raise LocalExecError("sandbox_error", f"Tool not found: {e}")


def run(language: str, code: str, stdin: str = "", timeout: int | None = None) -> dict:
    """Compile (if needed) and run code locally. Returns the same shape as the
    Piston path: ok/kind/stdout/stderr/compile_output/exit_code."""
    lang = _norm(language)
    builder = _BUILDERS.get(lang)
    if builder is None:
        raise LocalExecError("unsupported_language", f"No local runner for '{language}'.")
    timeout = timeout or LOCAL_EXEC_TIMEOUT

    with tempfile.TemporaryDirectory(prefix="tp_exec_") as wd:
        compile_cmd, run_cmd, filename = builder(wd)
        with open(os.path.join(wd, filename), "w", encoding="utf-8") as f:
            f.write(code)

        compile_output = ""
        if compile_cmd:
            cres = _exec(wd, compile_cmd, "", timeout)
            compile_output = (cres.stderr or cres.stdout or "").strip()
            if cres.returncode != 0:
                return {
                    "ok": False, "kind": "compile_error", "language": lang, "version": "local",
                    "stdout": "", "stderr": "", "output": "", "compile_output": compile_output,
                    "exit_code": cres.returncode,
                }

        res = _exec(wd, run_cmd, stdin, timeout)
        kind = "success" if res.returncode == 0 else "runtime_error"
        return {
            "ok": kind == "success", "kind": kind, "language": lang, "version": "local",
            "stdout": res.stdout or "", "stderr": res.stderr or "",
            "output": (res.stdout or "") + (res.stderr or ""),
            "compile_output": compile_output, "exit_code": res.returncode,
        }
