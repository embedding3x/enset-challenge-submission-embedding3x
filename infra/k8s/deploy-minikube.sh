#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Agentic TP Platform — minikube deployment
#
#   ./deploy-minikube.sh            build images + deploy everything
#   ./deploy-minikube.sh --skip-build   deploy only (images already built)
#   ./deploy-minikube.sh down       delete the whole namespace
#
# After deploying, run `minikube tunnel` in a separate terminal so the
# LoadBalancer services bind to localhost:3000 / 8080 / 8000 (the URLs baked
# into the frontend build). Ollama keeps running on the host Mac.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
K8S_DIR="$ROOT/infra/k8s"
NS=agentic-tp

if [[ "${1:-}" == "down" ]]; then
  kubectl delete namespace "$NS" --ignore-not-found
  echo "Namespace $NS deleted."
  exit 0
fi

command -v minikube >/dev/null || { echo "minikube not found"; exit 1; }
command -v kubectl  >/dev/null || { echo "kubectl not found"; exit 1; }

minikube status >/dev/null 2>&1 || { echo "Starting minikube…"; minikube start --memory 7g --cpus 4; }

# ─── 1. Build all images inside the minikube Docker daemon ──────────────────
if [[ "${1:-}" != "--skip-build" ]]; then
  echo "Building images inside minikube's Docker daemon…"
  eval "$(minikube docker-env)"
  declare -a builds=(
    "agentic/discovery-server:local  $ROOT/backend/discovery-server"
    "agentic/auth-service:local      $ROOT/backend/auth-service"
    "agentic/tp-service:local        $ROOT/backend/tp-service"
    "agentic/api-gateway:local       $ROOT/backend/api-gateway"
    "agentic/agent-gateway:local     $ROOT/backend/agent-gateway"
    "agentic/explanation-agent:local $ROOT/agents/explanation-agent"
    "agentic/hint-agent:local        $ROOT/agents/hint-agent"
    "agentic/evaluation-agent:local  $ROOT/agents/evaluation-agent"
    "agentic/orchestrator:local      $ROOT/agents/orchestrator"
    "agentic/frontend:local          $ROOT/frontend"
  )
  for entry in "${builds[@]}"; do
    tag=$(echo "$entry" | awk '{print $1}')
    ctx=$(echo "$entry" | awk '{print $2}')
    echo "── docker build -t $tag $ctx"
    docker build -t "$tag" "$ctx"
  done
fi

# ─── 2. Namespace + secret from the root .env ────────────────────────────────
kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -

DB_USER=$(grep -E '^AUTH_DB_USERNAME=' "$ROOT/.env" | cut -d= -f2- || true)
DB_PASS=$(grep -E '^AUTH_DB_PASSWORD=' "$ROOT/.env" | cut -d= -f2- || true)
DB_USER=${DB_USER:-postgres}
DB_PASS=${DB_PASS:-postgres}

# kubectl forbids mixing --from-env-file and --from-literal: merge into a temp file.
ENV_TMP=$(mktemp)
trap 'rm -f "$ENV_TMP"' EXIT
grep -E '^[A-Za-z_]+=' "$ROOT/.env" | grep -v '^RAG_DATABASE_URL=' > "$ENV_TMP"
echo "RAG_DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@postgres:5432/rag_db" >> "$ENV_TMP"

kubectl -n "$NS" create secret generic platform-env \
  --from-env-file="$ENV_TMP" \
  --dry-run=client -o yaml | kubectl apply -f -

# ─── 3. Ollama on the host: Service + Endpoints pointing at the host IP ──────
HOST_IP=$(minikube ssh "grep host.minikube.internal /etc/hosts | cut -f1" | tr -d '[:space:]')
echo "Host (Ollama) reachable from cluster at: $HOST_IP"
kubectl apply -f - <<EOF
apiVersion: v1
kind: Service
metadata:
  name: ollama
  namespace: $NS
spec:
  ports:
    - port: 11434
      targetPort: 11434
---
apiVersion: v1
kind: Endpoints
metadata:
  name: ollama
  namespace: $NS
subsets:
  - addresses:
      - ip: $HOST_IP
    ports:
      - port: 11434
EOF

# ─── 4. Apply all manifests ───────────────────────────────────────────────────
kubectl apply -k "$K8S_DIR"

echo
echo "Deployed. Watch rollout with:"
echo "  kubectl -n $NS get pods -w"
echo
echo "Then in a SEPARATE terminal (keeps running, needs sudo):"
echo "  minikube tunnel"
echo
echo "URLs once ready:  frontend http://localhost:3000 · api http://localhost:8080 · agents http://localhost:8000"
echo "NOTE: make sure Ollama accepts remote connections:  OLLAMA_HOST=0.0.0.0 ollama serve"
