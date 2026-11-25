import os, sqlite3, time
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from passlib.context import CryptContext
from pydantic import BaseModel
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()
SECRET = os.getenv("JWT_SECRET", "dev-medicalfield-secret-change-me")
if len(SECRET) < 24:
    raise RuntimeError("JWT_SECRET deve possuir pelo menos 24 caracteres.")
ALGORITHM = "HS256"
DB = "auth.db"
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()
app = FastAPI(
    title="MedicalField Auth API",
    root_path="/api/auth"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def db():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    return con

def init():
    with db() as c:
        c.execute("CREATE TABLE IF NOT EXISTS professionals (id TEXT PRIMARY KEY, identifier TEXT UNIQUE, name TEXT, role TEXT, password TEXT)")
        old = c.execute("SELECT id FROM professionals WHERE identifier='admin'").fetchone()
        admin = c.execute("SELECT id FROM professionals WHERE identifier='admin'").fetchone()
        hashed = pwd.hash("admin")
        if old:
            if admin and admin["id"] != old["id"]:
                c.execute("DELETE FROM professionals WHERE identifier='admin'")
            c.execute("UPDATE professionals SET identifier='admin', name='Administrador', role='ADMIN', password=? WHERE id=?", (hashed, old["id"]))
        elif admin:
            c.execute("UPDATE professionals SET name='Administrador', role='ADMIN', password=? WHERE identifier='admin'", (hashed,))
        else:
            c.execute("INSERT INTO professionals VALUES (?,?,?,?,?)", ("prof-admin","admin","Administrador","ADMIN",hashed))
init()

def current_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(creds.credentials, SECRET, algorithms=[ALGORITHM])
        return {"id": payload["sub"], "name": payload["name"], "identifier": payload["identifier"]}
    except (JWTError, KeyError):
        raise HTTPException(401, "Token inválido ou expirado")

class Login(BaseModel):
    identifier: str
    password: str

@app.middleware("http")
async def audit(request: Request, call_next):
    start = time.time()
    professional = None
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            claims = jwt.decode(auth_header[7:], SECRET, algorithms=[ALGORITHM])
            professional = claims.get("sub")
        except JWTError:
            professional = None
    try:
        response = await call_next(request)
    except Exception:
        response = None
        raise
    finally:
        entry = (datetime.now(timezone.utc).isoformat(), request.client.host if request.client else "", professional,
                 request.method, request.url.path, response.status_code if response else 500,
                 round((time.time()-start)*1000,2))
        with db() as c:
            c.execute("CREATE TABLE IF NOT EXISTS access_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, data_hora TEXT, ip TEXT, profissional TEXT, metodo TEXT, rota TEXT, status INTEGER, tempo_ms REAL)")
            c.execute("INSERT INTO access_audit(data_hora,ip,profissional,metodo,rota,status,tempo_ms) VALUES(?,?,?,?,?,?,?)", entry)
        print(dict(data_hora=entry[0], ip=entry[1], profissional=entry[2], metodo=entry[3], rota=entry[4], status=entry[5], tempo_ms=entry[6]))
    return response

@app.post("/auth/login")
def login(data: Login):
    with db() as c:
        row = c.execute("SELECT * FROM professionals WHERE identifier=?", (data.identifier,)).fetchone()
    if not row or not pwd.verify(data.password, row["password"]):
        raise HTTPException(401, "Credenciais inválidas")
    token = jwt.encode({"sub":row["id"],"name":row["name"],"identifier":row["identifier"],"exp":datetime.now(timezone.utc)+timedelta(hours=8)}, SECRET, algorithm=ALGORITHM)
    return {"access_token":token,"token_type":"bearer","professional":{"id":row["id"],"name":row["name"],"identifier":row["identifier"],"role":row["role"]}}

@app.get("/me")
def me(user=Depends(current_user)):
    return user

@app.get("/health")
def health():
    return {"status":"ok","service":"auth"}
