#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME="$HOME/.medicalfield"
NAMES=(documents records auth)
PORTS=(8003 8002 8001)

is_project_process() {
    local pid="$1" cwd cmd
    [[ -r "/proc/$pid/cmdline" ]] || return 1
    cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
    cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
    [[ "$cwd" == "$ROOT" || "$cwd" == "$ROOT/"* || "$cmd" == *"$ROOT"* ]]
}

# Retorna a árvore de descendentes em ordem reversa (filhos antes dos pais).
process_tree() {
    python3 - "$1" <<'PYTHON'
import os, sys
root = int(sys.argv[1])
children = {}
for entry in os.listdir('/proc'):
    if not entry.isdigit():
        continue
    try:
        status = open(f'/proc/{entry}/status', encoding='utf-8').read()
        ppid = next(int(line.split()[1]) for line in status.splitlines() if line.startswith('PPid:'))
        children.setdefault(ppid, []).append(int(entry))
    except (OSError, StopIteration, ValueError):
        pass
ordered, seen = [], set()
def visit(pid):
    if pid in seen:
        return
    seen.add(pid)
    for child in children.get(pid, []):
        visit(child)
    ordered.append(pid)
visit(root)
for pid in ordered:
    print(pid)
PYTHON
}

stop_tree() {
    local rootpid="$1" label="$2"
    if ! is_project_process "$rootpid"; then
        echo "ATENÇÃO: PID $rootpid ($label) não foi confirmado como pertencente ao projeto; ignorado."
        return 0
    fi
    mapfile -t TREE < <(process_tree "$rootpid")
    echo "Encerrando $label: ${TREE[*]}"
    for PID in "${TREE[@]}"; do kill -TERM "$PID" 2>/dev/null || true; done
    sleep 2
    for PID in "${TREE[@]}"; do kill -KILL "$PID" 2>/dev/null || true; done
}

# Primeira opção: PID raiz registrado. Funciona também com processos da versão antiga.
for NAME in "${NAMES[@]}"; do
    FILE="$RUNTIME/$NAME.pid"
    [[ -f "$FILE" ]] || continue
    PID="$(cat "$FILE" 2>/dev/null || true)"
    if [[ "$PID" =~ ^[0-9]+$ ]] && (( PID > 1 )) && kill -0 "$PID" 2>/dev/null; then
        stop_tree "$PID" "$NAME"
    fi
done

# Segunda opção: listeners nas portas conhecidas, sempre validando o caminho do projeto.
for PORT in "${PORTS[@]}"; do
    PIDS="$(ss -ltnp "sport = :$PORT" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u || true)"
    while read -r PID; do
        [[ -n "$PID" ]] || continue
        if kill -0 "$PID" 2>/dev/null && is_project_process "$PID"; then
            stop_tree "$PID" "listener da porta $PORT"
        elif kill -0 "$PID" 2>/dev/null; then
            echo "ATENÇÃO: porta $PORT pertence a processo externo PID $PID; não será encerrado."
        fi
    done <<< "$PIDS"
done

sleep 1
REMAINING=0
for PORT in "${PORTS[@]}"; do
    if ss -ltnH "sport = :$PORT" 2>/dev/null | grep -q LISTEN; then
        echo "ATENÇÃO: porta $PORT continua ocupada:"
        ss -ltnp "sport = :$PORT" 2>/dev/null || true
        REMAINING=1
    fi
done
if (( REMAINING )); then
    echo "Encerramento incompleto. Os arquivos de controle foram preservados para diagnóstico."
    exit 1
fi
rm -f "$RUNTIME"/*.pid "$RUNTIME"/*.pgid 2>/dev/null || true
echo "MedicalField encerrado. Todas as portas estão livres."
