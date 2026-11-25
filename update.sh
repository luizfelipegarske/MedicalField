#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZIP="${1:-}"
if [[ -z "$ZIP" || ! -f "$ZIP" ]]; then
    echo "Uso: ./update.sh caminho/MedicalFieldV7_3.zip"
    exit 1
fi
ZIP="$(realpath "$ZIP")"
STAMP="$(date +%Y%m%d_%H%M%S)"
WORK="$HOME/.medicalfield-update-$STAMP"
BACKUP="$HOME/medicalfield-backups/$STAMP"
EXTRACT="$WORK/extract"
mkdir -p "$EXTRACT" "$BACKUP"
trap 'rm -rf "$WORK"' EXIT

echo "=================================="
echo " MEDICALFIELD - ATUALIZADOR V7.3"
echo "=================================="
echo "ZIP: $ZIP"
echo "Backup: $BACKUP"

SOURCE_ROOT="$(python3 - "$ZIP" "$EXTRACT" <<'PYTHON'
import sys, zipfile
from pathlib import Path
archive, out = Path(sys.argv[1]), Path(sys.argv[2]).resolve()
with zipfile.ZipFile(archive) as z:
    for item in z.infolist():
        dest = (out / item.filename).resolve()
        if dest != out and out not in dest.parents:
            raise SystemExit('ERRO: caminho inseguro no ZIP')
    z.extractall(out)
candidates = [p.parent for p in out.rglob('README.md')
              if (p.parent / 'frontend/package.json').is_file()
              and (p.parent / 'services/auth/app.py').is_file()]
if len(candidates) != 1:
    raise SystemExit('ERRO: não foi possível identificar uma única raiz MedicalField')
print(candidates[0])
PYTHON
)"

for FILE in frontend/package.json frontend/package-lock.json services/auth/app.py \
    services/auth/requirements.txt services/records/server.js services/records/package-lock.json \
    services/documents/go.mod services/documents/main.go start.sh stop.sh update.sh VERSION; do
    [[ -f "$SOURCE_ROOT/$FILE" ]] || { echo "ERRO: arquivo ausente no ZIP: $FILE"; exit 1; }
done
[[ -x "$ROOT/services/auth/.venv/bin/python" ]] || { echo "ERRO: .venv Python não encontrado."; exit 1; }
command -v node >/dev/null || { echo "ERRO: Node.js não instalado."; exit 1; }
command -v npm >/dev/null || { echo "ERRO: npm não instalado."; exit 1; }
command -v go >/dev/null || { echo "ERRO: Go não instalado."; exit 1; }
command -v ss >/dev/null || { echo "ERRO: ss não instalado."; exit 1; }

# Encerrar antes de copiar bancos, para não copiar SQLite em uso.
echo "[1/6] Encerrando versão atual..."
"$ROOT/stop.sh"
for PORT in 8001 8002 8003 5173; do
    if ss -ltnH "sport = :$PORT" 2>/dev/null | grep -q LISTEN; then
        echo "ERRO: porta $PORT ainda ocupada; atualização cancelada sem sobrescrever arquivos."
        ss -ltnp "sport = :$PORT" 2>/dev/null || true
        exit 1
    fi
done

PRESERVE=(
    services/auth/.env services/auth/auth.db services/auth/auth.db-wal services/auth/auth.db-shm services/auth/.venv
    services/records/.env services/records/records.db services/records/records.db-wal services/records/records.db-shm services/records/node_modules
    services/documents/.env services/documents/documents-access.log
    frontend/node_modules frontend/vite.config.ts frontend/src/api.ts
    update.sh
)
echo "[2/6] Criando backup..."
for ITEM in "${PRESERVE[@]}"; do
    if [[ -e "$ROOT/$ITEM" ]]; then
        mkdir -p "$BACKUP/$(dirname "$ITEM")"
        cp -a "$ROOT/$ITEM" "$BACKUP/$ITEM"
    fi
done

# Sincroniza código novo, preservando dados locais e o atualizador que está executando.
echo "[3/6] Aplicando arquivos da V7.3..."
python3 - "$SOURCE_ROOT" "$ROOT" <<'PYTHON'
import sys, shutil
from pathlib import Path
src, dst = Path(sys.argv[1]), Path(sys.argv[2])
protected = {
    'services/auth/.env', 'services/auth/auth.db', 'services/auth/auth.db-wal', 'services/auth/auth.db-shm', 'services/auth/.venv',
    'services/records/.env', 'services/records/records.db', 'services/records/records.db-wal', 'services/records/records.db-shm', 'services/records/node_modules',
    'services/documents/.env', 'services/documents/documents-access.log',
    'frontend/node_modules', 'frontend/vite.config.ts', 'frontend/src/api.ts', 'update.sh',
}
def exact(rel): return rel in protected
def contains(rel):
    prefix = rel.rstrip('/') + '/'
    return any(p.startswith(prefix) for p in protected)
def sync(s, d, rel=''):
    d.mkdir(parents=True, exist_ok=True)
    names = {p.name for p in s.iterdir()}
    for old in list(d.iterdir()):
        child = f'{rel}/{old.name}'.strip('/')
        if exact(child) or contains(child):
            continue
        if old.name not in names:
            shutil.rmtree(old) if old.is_dir() and not old.is_symlink() else old.unlink()
    for item in s.iterdir():
        child = f'{rel}/{item.name}'.strip('/')
        if exact(child): continue
        target = d / item.name
        if item.is_dir():
            if target.exists() and not target.is_dir(): target.unlink()
            sync(item, target, child)
        else:
            if target.is_dir(): shutil.rmtree(target)
            shutil.copy2(item, target)
sync(src, dst)
print('Código atualizado; bancos, .env e dependências locais preservados.')
PYTHON
chmod +x "$ROOT/start.sh" "$ROOT/stop.sh" "$ROOT/update.sh"

echo "[4/6] Atualizando dependências Python e Node..."
"$ROOT/services/auth/.venv/bin/python" -m pip install -r "$ROOT/services/auth/requirements.txt"
(cd "$ROOT/services/records" && npm ci)
(cd "$ROOT/frontend" && npm pkg set 'scripts.dev=vite --host 127.0.0.1' 'scripts.preview=vite preview --host 127.0.0.1' && npm ci && npm run build)

echo "[5/6] Compilando serviço Documents..."
(cd "$ROOT/services/documents" && go mod download && go build -o medicalfield-documents .)
chmod +x "$ROOT/services/documents/medicalfield-documents"

echo "[6/6] Iniciando e validando..."
"$ROOT/start.sh"
echo "=================================="
echo " ATUALIZAÇÃO V7.3 CONCLUÍDA"
echo "Backup: $BACKUP"
echo "Logs: $HOME/.medicalfield/logs"
