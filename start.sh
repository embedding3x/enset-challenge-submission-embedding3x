#!/usr/bin/env bash
# =============================================================================
# Agentic TP Platform — Full Start Script
# Starts all AI agents (Ollama), agent gateway, and Next.js frontend.
# Spring Boot services are started automatically if Java + Maven are available.
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGS="$ROOT/logs"
VENV="$ROOT/.venv"
PID_FILE="$ROOT/.running_pids"

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

# ── PID tracking ──────────────────────────────────────────────────────────────
declare -a PIDS=()

cleanup() {
    echo -e "\n${BOLD}${YELLOW}⟳  Shutting down all services...${NC}"
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done
    # Kill any remaining children of this shell
    pkill -P $$ 2>/dev/null || true
    rm -f "$PID_FILE"
    echo -e "${GREEN}✓  All services stopped. Goodbye!${NC}\n"
}
trap cleanup EXIT INT TERM

# ── UI helpers ────────────────────────────────────────────────────────────────
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()      { echo -e "${GREEN}[ OK ]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()    { echo -e "${RED}[FAIL]${NC}  $*"; }
section() { echo -e "\n${BOLD}${CYAN}▸ $*${NC}"; }

banner() {
    echo -e "${BOLD}${CYAN}"
    cat << 'EOF'
╔═══════════════════════════════════════════════════════════════╗
║          Agentic TP Platform — Development Start              ║
║                                                               ║
║  Agents: Mistral·deepseek-coder·gemma4·deepseek-v3.2·qwen   ║
║  Backend: Spring Boot + Spring Cloud (optional)               ║
║  Frontend: Next.js 14                                         ║
╚═══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

cmd_exists()  { command -v "$1" &>/dev/null; }
port_in_use() { lsof -i ":$1" -sTCP:LISTEN -t &>/dev/null 2>&1; }

free_port() {
    local port="$1"
    if port_in_use "$port"; then
        local pids
        pids=$(lsof -ti ":$port" -sTCP:LISTEN 2>/dev/null)
        if [ -n "$pids" ]; then
            kill $pids 2>/dev/null || true
            # Verify the port is actually released; escalate to SIGKILL if not.
            local waited=0
            while port_in_use "$port" && [ "$waited" -lt 6 ]; do
                sleep 0.5
                waited=$((waited + 1))
            done
            if port_in_use "$port"; then
                kill -9 $pids 2>/dev/null || true
                sleep 0.5
            fi
            if port_in_use "$port"; then
                warn "Port $port still in use after SIGKILL (PIDs: $pids)"
            else
                info "Freed port $port (was PID $pids)"
            fi
        fi
    fi
}

wait_for_health() {
    local name="$1" url="$2" timeout="${3:-90}"
    local interval=2 elapsed=0
    echo -ne "  ${DIM}Waiting for ${BOLD}${name}${NC}${DIM} at ${url}${NC} "
    while [ "$elapsed" -lt "$timeout" ]; do
        if curl -sf "$url" >/dev/null 2>&1; then
            echo -e " ${GREEN}✓ ready${NC} ${DIM}(${elapsed}s)${NC}"
            return 0
        fi
        sleep "$interval"
        elapsed=$((elapsed + interval))
        echo -ne "."
    done
    echo -e " ${RED}✗ timeout after ${timeout}s${NC}"
    return 1
}

# ── Start a Python service using the shared venv ──────────────────────────────
start_python() {
    local name="$1" rel_dir="$2" port="$3"
    local abs_dir="$ROOT/$rel_dir"
    local logfile="$LOGS/${name}.log"

    if port_in_use "$port"; then
        warn "${name}: port ${port} already in use — skipping"
        return 0
    fi

    mkdir -p "$LOGS"
    (
        cd "$abs_dir"
        # Load .env explicitly so each subprocess has the variables
        set -a; source "$ROOT/.env" 2>/dev/null || true; set +a
        exec "$VENV/bin/python" main.py
    ) > "$logfile" 2>&1 &

    local pid=$!
    PIDS+=("$pid")
    echo "$pid" >> "$PID_FILE"
    ok "${BOLD}${name}${NC} started — PID ${pid} — ${DIM}logs/${name}.log${NC}"
}

# ── Start a Spring Boot service with Maven ────────────────────────────────────
start_spring() {
    local name="$1" rel_dir="$2" port="$3"
    local abs_dir="$ROOT/backend/$rel_dir"
    local logfile="$LOGS/${name}.log"

    if port_in_use "$port"; then
        warn "${name}: port ${port} already in use — skipping"
        return 0
    fi

    if [ ! -f "$abs_dir/pom.xml" ]; then
        warn "${name}: pom.xml not found at $abs_dir — skipping"
        return 0
    fi

    mkdir -p "$LOGS"
    (
        cd "$abs_dir"
        set -a; source "$ROOT/.env" 2>/dev/null || true; set +a
        exec mvn spring-boot:run -q 2>&1
    ) > "$logfile" 2>&1 &

    local pid=$!
    PIDS+=("$pid")
    echo "$pid" >> "$PID_FILE"
    ok "${BOLD}${name}${NC} started — PID ${pid} — ${DIM}logs/${name}.log${NC}"
}

# ── Status line in final dashboard ───────────────────────────────────────────
show_status() {
    local name="$1" url="$2" port="$3" extra="${4:-}"
    if curl -sf "$url" >/dev/null 2>&1; then
        echo -e "  ${GREEN}●${NC} ${BOLD}${name}${NC}  →  ${CYAN}http://localhost:${port}${NC}  ${extra:+${DIM}[${extra}]${NC}}"
    else
        echo -e "  ${RED}●${NC} ${BOLD}${name}${NC}  →  ${RED}not responding${NC}  ${DIM}— tail -f logs/${name}.log${NC}"
    fi
}

# =============================================================================
# MAIN
# =============================================================================
main() {
    banner

    # ── 1. Prerequisites ──────────────────────────────────────────────────────
    section "Checking Prerequisites"

    ERRORS=0
    cmd_exists python3 && ok "Python $(python3 --version 2>&1 | awk '{print $2}')" || { fail "Python 3 not found"; ERRORS=$((ERRORS+1)); }
    cmd_exists node   && ok "Node.js $(node --version)"                            || { fail "Node.js not found — install from https://nodejs.org"; ERRORS=$((ERRORS+1)); }
    cmd_exists npm    && ok "npm $(npm --version)"                                 || { fail "npm not found"; ERRORS=$((ERRORS+1)); }
    cmd_exists curl   && ok "curl available"                                       || { fail "curl not found"; ERRORS=$((ERRORS+1)); }

    if [ "$ERRORS" -gt 0 ]; then
        fail "Fix the errors above and re-run."
        exit 1
    fi

    # Java/Maven (optional)
    JAVA_OK=false
    if cmd_exists java && cmd_exists mvn; then
        ok "Java $(java --version 2>&1 | head -1 | awk '{print $1,$2}')"
        ok "Maven $(mvn --version 2>&1 | head -1 | awk '{print $3}')"
        JAVA_OK=true
    else
        warn "Java or Maven not found — Spring Boot services will be skipped"
    fi

    # ── 2. Load .env ──────────────────────────────────────────────────────────
    section "Loading Configuration"

    if [ -f "$ROOT/.env" ]; then
        set -a
        # shellcheck disable=SC1090
        source "$ROOT/.env"
        set +a
        ok "Loaded .env"
    else
        warn ".env not found — using built-in defaults"
    fi

    OLLAMA_URL="${OLLAMA_BASE_URL:-http://localhost:11434}"
    EXPL_MODEL="${EXPLANATION_AGENT_MODEL:-mistral}"
    HINT_MODEL="${HINT_AGENT_MODEL:-deepseek-coder:6.7b}"
    EVAL_MODEL="${EVALUATION_AGENT_MODEL:-gemma4:31b-cloud}"
    ORCH_MODEL="${ORCHESTRATOR_MODEL:-deepseek-v3.2:cloud}"
    CREATOR_MODEL="${CREATOR_AGENT_MODEL:-qwen2.5-coder:latest}"
    EMBED_MODEL="${RAG_EMBED_MODEL:-nomic-embed-text}"

    info "Explanation agent model : ${BOLD}${EXPL_MODEL}${NC}"
    info "Hint agent model        : ${BOLD}${HINT_MODEL}${NC}"
    info "Evaluation agent model  : ${BOLD}${EVAL_MODEL}${NC}"
    info "Orchestrator model      : ${BOLD}${ORCH_MODEL}${NC}"
    info "Creator agent model     : ${BOLD}${CREATOR_MODEL}${NC}"
    info "RAG embedding model     : ${BOLD}${EMBED_MODEL}${NC}"
    info "Ollama URL              : ${BOLD}${OLLAMA_URL}${NC}"

    # ── 3. Check Ollama ───────────────────────────────────────────────────────
    section "Checking Ollama"

    if curl -sf "${OLLAMA_URL}/api/tags" >/dev/null 2>&1; then
        ok "Ollama is running at ${OLLAMA_URL}"

        # Get available model names (strip :latest suffix for comparison)
        AVAILABLE_MODELS=$(curl -s "${OLLAMA_URL}/api/tags" | \
            python3 -c "
import sys,json
data=json.load(sys.stdin)
names=[m['name'] for m in data.get('models',[])]
print('\n'.join(names))
" 2>/dev/null)

        echo -e "  ${DIM}Available models:${NC}"
        echo "$AVAILABLE_MODELS" | sed 's/^/    /'

        # Verify each required model is available
        check_model() {
            local model="$1" label="$2"
            # Allow matching with or without :latest suffix
            local base="${model%%:*}"
            if echo "$AVAILABLE_MODELS" | grep -q "^${model}$" || \
               echo "$AVAILABLE_MODELS" | grep -q "^${base}:"; then
                ok "${label}: ${BOLD}${model}${NC} ${GREEN}found${NC}"
            else
                warn "${label}: ${BOLD}${model}${NC} ${YELLOW}NOT found in Ollama${NC}"
                warn "  Run:  ollama pull ${model}"
            fi
        }

        echo ""
        check_model "$EXPL_MODEL" "Explanation agent"
        check_model "$HINT_MODEL" "Hint agent       "
        check_model "$EVAL_MODEL" "Evaluation agent "
        check_model "$ORCH_MODEL" "Orchestrator     "
        check_model "$CREATOR_MODEL" "Creator agent    "
        check_model "$EMBED_MODEL" "RAG embeddings   "
    else
        warn "Ollama not responding at ${OLLAMA_URL}"
        warn "Agents will start but LLM calls will fail."
        warn "Fix: open a new terminal and run:  ollama serve"
    fi

    # ── 4. Python virtual environment ─────────────────────────────────────────
    section "Setting Up Python Environment"

    if [ ! -d "$VENV" ]; then
        info "Creating shared virtual environment at .venv ..."
        PYTHON_BIN=$(command -v python3.13 || command -v python3.12 || command -v python3)
        "$PYTHON_BIN" -m venv "$VENV"
        ok "Virtual environment created ($(\"$VENV/bin/python\" --version))"
    else
        ok "Virtual environment exists (.venv/)"
    fi

    info "Installing Python dependencies (this may take a minute on first run)..."
    "$VENV/bin/pip" install --quiet --upgrade pip

    COMBINED_REQS="$ROOT/.combined_requirements.txt"
    # Merge all requirements, deduplicate
    cat \
        "$ROOT/agents/explanation-agent/requirements.txt" \
        "$ROOT/agents/hint-agent/requirements.txt" \
        "$ROOT/agents/evaluation-agent/requirements.txt" \
        "$ROOT/agents/orchestrator/requirements.txt" \
        "$ROOT/agents/creator-agent/requirements.txt" \
        "$ROOT/backend/agent-gateway/requirements.txt" \
        "$ROOT/backend/rag-service/requirements.txt" \
        "$ROOT/backend/validation-service/requirements.txt" \
        2>/dev/null | sort -u > "$COMBINED_REQS"

    "$VENV/bin/pip" install --quiet -r "$COMBINED_REQS"
    rm -f "$COMBINED_REQS"
    ok "Python packages installed"

    # ── 5. Frontend dependencies ──────────────────────────────────────────────
    section "Frontend Setup"

    FRONTEND_DIR="$ROOT/frontend"
    if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
        info "Installing frontend npm packages (first run — may take 1-2 min)..."
        (cd "$FRONTEND_DIR" && npm install --silent)
        ok "Frontend packages installed"
    else
        ok "Frontend packages already installed"
    fi

    # ── 6. Free occupied ports ────────────────────────────────────────────────
    section "Freeing Ports"
    for port in 8000 8001 8002 8003 8004 8005 8006 8007 3000; do
        free_port "$port"
    done
    if [ "$JAVA_OK" = true ]; then
        for port in 8761 8081 8082 8080; do
            free_port "$port"
        done
    fi
    rm -f "$PID_FILE"

    # ── 7. Start AI Agent Services ────────────────────────────────────────────
    section "Starting AI Agent Services"

    start_python "explanation-agent" "agents/explanation-agent" "8001"
    sleep 0.5
    start_python "hint-agent"        "agents/hint-agent"        "8002"
    sleep 0.5
    start_python "evaluation-agent"  "agents/evaluation-agent"  "8003"
    sleep 0.5
    start_python "orchestrator"      "agents/orchestrator"      "8004"
    sleep 0.5
    start_python "creator-agent"     "agents/creator-agent"     "8007"
    sleep 0.5

    # ── 8. Start RAG + Validation Services + Agent Gateway ────────────────────
    section "Starting RAG Service"
    start_python "rag-service" "backend/rag-service" "8005"
    sleep 0.5

    section "Starting Validation Service"
    start_python "validation-service" "backend/validation-service" "8006"
    sleep 0.5

    section "Starting Agent Gateway"
    start_python "agent-gateway" "backend/agent-gateway" "8000"
    sleep 0.5

    # ── 9. Spring Boot services (optional) ────────────────────────────────────
    if [ "$JAVA_OK" = true ]; then
        section "Starting Spring Boot Microservices"

        start_spring "discovery-server" "discovery-server" "8761"
        info "Waiting for Eureka to be ready (this can take ~30s)..."
        if wait_for_health "discovery-server" "http://localhost:8761/actuator/health" 90; then
            info "Giving Eureka 10s to fully initialize before accepting registrations..."
            sleep 10
            start_spring "auth-service" "auth-service" "8081"
            start_spring "tp-service"   "tp-service"   "8082"
            info "Waiting for auth-service..."
            wait_for_health "auth-service" "http://localhost:8081/api/auth/health" 90 || true
            start_spring "api-gateway"  "api-gateway"  "8080"
        else
            warn "Eureka not ready — skipping auth-service, tp-service, api-gateway"
        fi
    fi

    # ── 10. Start Frontend ─────────────────────────────────────────────────────
    section "Starting Frontend Dev Server"

    mkdir -p "$LOGS"
    (
        cd "$FRONTEND_DIR"
        set -a; source "$ROOT/.env" 2>/dev/null || true; set +a
        exec npm run dev 2>&1
    ) > "$LOGS/frontend.log" 2>&1 &

    FRONT_PID=$!
    PIDS+=("$FRONT_PID")
    echo "$FRONT_PID" >> "$PID_FILE"
    ok "${BOLD}frontend${NC} started — PID ${FRONT_PID} — ${DIM}logs/frontend.log${NC}"

    # ── 11. Health checks ──────────────────────────────────────────────────────
    section "Waiting for Services to be Ready"

    wait_for_health "tp-service"        "http://localhost:8082/api/tp/health"       60 || true
    wait_for_health "api-gateway"       "http://localhost:8080/api/gateway/health"  60 || true
    wait_for_health "rag-service"        "http://localhost:8005/health" 60 || true
    wait_for_health "validation-service" "http://localhost:8006/health" 60 || true
    wait_for_health "agent-gateway"     "http://localhost:8000/health" 60 || true
    wait_for_health "explanation-agent" "http://localhost:8001/health" 60 || true
    wait_for_health "hint-agent"        "http://localhost:8002/health" 60 || true
    wait_for_health "evaluation-agent"  "http://localhost:8003/health" 60 || true
    wait_for_health "orchestrator"      "http://localhost:8004/health" 60 || true
    wait_for_health "creator-agent"     "http://localhost:8007/health" 60 || true
    wait_for_health "frontend"          "http://localhost:3000"        90 || true

    # ── 12. Status dashboard ───────────────────────────────────────────────────
    echo ""
    echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}${CYAN}                     SERVICE STATUS                       ${NC}"
    echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${NC}"

    echo ""
    echo -e "  ${BOLD}AI Agents (Ollama):${NC}"
    show_status "explanation-agent"  "http://localhost:8001/health" "8001" "$EXPL_MODEL"
    show_status "hint-agent"         "http://localhost:8002/health" "8002" "$HINT_MODEL"
    show_status "evaluation-agent"   "http://localhost:8003/health" "8003" "$EVAL_MODEL"
    show_status "orchestrator"       "http://localhost:8004/health" "8004" "$ORCH_MODEL"
    show_status "creator-agent"      "http://localhost:8007/health" "8007" "$CREATOR_MODEL"
    show_status "rag-service"        "http://localhost:8005/health" "8005" "$EMBED_MODEL"
    show_status "validation-service" "http://localhost:8006/health" "8006"
    show_status "agent-gateway"      "http://localhost:8000/health" "8000"

    echo ""
    echo -e "  ${BOLD}Spring Boot Microservices:${NC}"
    if [ "$JAVA_OK" = true ]; then
        show_status "discovery-server" "http://localhost:8761/actuator/health" "8761"
        show_status "auth-service"     "http://localhost:8081/api/auth/health" "8081"
        show_status "tp-service"       "http://localhost:8082/api/tp/health" "8082"
        show_status "api-gateway"      "http://localhost:8080/api/gateway/health" "8080"
    else
        echo -e "  ${YELLOW}●${NC} Spring Boot services skipped (Java/Maven not available)"
    fi

    echo ""
    echo -e "  ${BOLD}Frontend:${NC}"
    show_status "frontend" "http://localhost:3000" "3000"

    echo ""
    echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo -e ""
    echo -e "  ${BOLD}${GREEN}Open your browser:  http://localhost:3000${NC}"
    echo -e "  ${BOLD}Agent Gateway API:  http://localhost:8000${NC}"
    echo -e "  ${BOLD}Agents health:      http://localhost:8000/agents/health${NC}"
    if [ "$JAVA_OK" = true ]; then
        echo -e "  ${BOLD}Eureka dashboard:   http://localhost:8761${NC}"
        echo -e "  ${BOLD}API Gateway:        http://localhost:8080${NC}"
    fi
    echo ""
    echo -e "  ${DIM}Logs: $LOGS/${NC}"
    echo -e "  ${DIM}To tail a log: tail -f logs/explanation-agent.log${NC}"
    echo ""
    echo -e "${YELLOW}  Press Ctrl+C to stop all services${NC}"
    echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo ""

    # Keep running until Ctrl+C
    wait
}

main "$@"
