#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME="$HOME/.medicalfield"
LOGS="$RUNTIME/logs"
mkdir -p "$LOGS" "$RUNTIME"
for PORT in 8001 8002 8003; do
  if ss -ltnH "sport = :$PORT" 2>/dev/null | grep -q LISTEN; then
    echo "ERRO: porta $PORT já está ocupada."
    ss -ltnp "sport = :$PORT" 2>/dev/null || true
    exit 1
  fi
done
start_service() {
  local name="$1" dir="$2"; shift 2
  local logfile="$LOGS/$name.log" pidfile="$RUNTIME/$name.pid" pgidfile="$RUNTIME/$name.pgid"
  rm -f "$pidfile" "$pgidfile"
  python3 - "$RUNTIME" "$logfile" "$name" "$dir" "$@" <<'PY'
import os, subprocess, sys, tempfile
runtime, logfile, name, workdir, *command = sys.argv[1:]
wrapper='cd "$1" || exit 111; shift; exec "$@"'
with open(logfile,"ab",buffering=0) as log:
 p=subprocess.Popen(["bash","-c",wrapper,"medicalfield-service",workdir,*command],
  stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True,close_fds=True)
pid=p.pid; pgid=os.getpgid(pid)
if pid != pgid: p.terminate(); raise SystemExit(f"Grupo independente não criado: {name}")
for suffix,value in (("pid",pid),("pgid",pgid)):
 fd,tmp=tempfile.mkstemp(prefix=f".{name}.",dir=runtime,text=True)
 with os.fdopen(fd,"w") as f: f.write(f"{value}\\n")
 os.replace(tmp,os.path.join(runtime,f"{name}.{suffix}"))
print(f"{name} iniciado (PID/PGID {pid}).")
PY
}
trap 'status=$?; if ((status)); then "$ROOT/stop.sh" || true; fi; exit "$status"' EXIT
start_service auth "$ROOT/services/auth" "$ROOT/services/auth/.venv/bin/python" -m uvicorn app:app --host 127.0.0.1 --port 8001
start_service records "$ROOT/services/records" npm start
start_service documents "$ROOT/services/documents" "$ROOT/services/documents/medicalfield-documents"
for spec in "auth:8001" "records:8002" "documents:8003"; do
 name="${spec%%:*}"; port="${spec##*:}"; ok=0
 for _ in $(seq 1 25); do
  if curl --connect-timeout 1 --max-time 2 -fsS "http://127.0.0.1:$port/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 1
 done
 ((ok)) || { echo "ERRO: $name não respondeu. Consulte $LOGS/$name.log"; exit 1; }
 echo "$name: OK"
done
trap - EXIT
echo "MedicalField 7.7.1 iniciado. Frontend estático servido pelo Nginx."
echo "Logs: $LOGS"
