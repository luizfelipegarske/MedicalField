import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import { openapiSpecification } from './swagger.js';
dotenv.config();
const app=express(), db=new Database('records.db'), SECRET=process.env.JWT_SECRET||'dev-medicalfield-secret-change-me';
if(SECRET.length<24) throw new Error('JWT_SECRET deve possuir pelo menos 24 caracteres.');
app.use(cors()); app.use(express.json({limit:'5mb'}));
db.exec(`
CREATE TABLE IF NOT EXISTS people(id TEXT PRIMARY KEY,nome TEXT,documento TEXT,dataNascimento TEXT,telefone TEXT,createdAt TEXT);
CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,pessoaId TEXT UNIQUE,alergias TEXT,historico TEXT,createdAt TEXT);
CREATE TABLE IF NOT EXISTS attendances(id TEXT PRIMARY KEY,clientId TEXT UNIQUE,pessoaId TEXT,data TEXT,queixa TEXT,pressao TEXT,frequenciaCardiaca TEXT,frequenciaRespiratoria TEXT,saturacao TEXT,temperatura TEXT,glasgow TEXT,triagem TEXT,medicamentos TEXT,observacoes TEXT,updatedAt TEXT,profissionalId TEXT);
CREATE TABLE IF NOT EXISTS medicines(id TEXT PRIMARY KEY,nome TEXT,concentracao TEXT,principioAtivo TEXT,formaFarmaceutica TEXT,apresentacao TEXT,fabricante TEXT,registroAnvisa TEXT,unidadeMedida TEXT,observacoes TEXT);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,data_hora TEXT,ip TEXT,profissional TEXT,metodo TEXT,rota TEXT,status INTEGER,tempo_ms REAL);
`);

// Migração incremental e compatível com bancos já existentes na VM.
function ensureColumn(table, column, definition) {
 const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(x=>x.name);
 if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
for (const [column, definition] of [
 ['tipoAtendimento',"TEXT DEFAULT ''"],['localAtendimento',"TEXT DEFAULT ''"],['dataHoraInicio',"TEXT DEFAULT ''"],['dataHoraFim',"TEXT DEFAULT ''"],
 ['historiaAtual',"TEXT DEFAULT ''"],['antecedentes',"TEXT DEFAULT ''"],['alergias',"TEXT DEFAULT ''"],['exameFisico',"TEXT DEFAULT ''"],['conduta',"TEXT DEFAULT ''"],['destino',"TEXT DEFAULT ''"],['responsavelEquipe',"TEXT DEFAULT ''"],['acompanhante',"TEXT DEFAULT ''"]
]) ensureColumn('attendances', column, definition);
for (const [column, definition] of [
 ['principioAtivo',"TEXT DEFAULT ''"],['formaFarmaceutica',"TEXT DEFAULT ''"],['apresentacao',"TEXT DEFAULT ''"],['fabricante',"TEXT DEFAULT ''"],['registroAnvisa',"TEXT DEFAULT ''"],['unidadeMedida',"TEXT DEFAULT ''"],['observacoes',"TEXT DEFAULT ''"]
]) ensureColumn('medicines', column, definition);

function auth(req,res,next){
 const h=req.headers.authorization||''; try { if(!h.startsWith('Bearer ')) throw Error(); req.user=jwt.verify(h.slice(7),SECRET,{algorithms:['HS256']}); next(); }
 catch {res.status(401).json({error:'Não autenticado'});}
}
app.use((req,res,next)=>{const start=Date.now();res.on('finish',()=>{try{db.prepare('INSERT INTO audit(data_hora,ip,profissional,metodo,rota,status,tempo_ms) VALUES(?,?,?,?,?,?,?)').run(new Date().toISOString(),req.ip,req.user?.sub||null,req.method,req.path,res.statusCode,Date.now()-start);}catch{} console.log(new Date().toISOString(),req.ip,req.user?.sub||'-',req.method,req.path,res.statusCode,Date.now()-start+'ms');});next();});
app.get('/health',(q,s)=>s.json({status:'ok',service:'records'}));

app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(openapiSpecification)
);

app.use(auth);
app.get('/medicamento',(q,s)=>s.json(db.prepare('SELECT * FROM medicines ORDER BY nome').all()));
app.post('/medicamento',(q,s)=>{const x=q.body||{};if(!String(x.nome||'').trim())return s.status(400).json({error:'Informe o nome do medicamento.'});const id=x.id||crypto.randomUUID();db.prepare('INSERT INTO medicines (id,nome,concentracao,principioAtivo,formaFarmaceutica,apresentacao,fabricante,registroAnvisa,unidadeMedida,observacoes) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,String(x.nome).trim(),x.concentracao||'',x.principioAtivo||'',x.formaFarmaceutica||'',x.apresentacao||'',x.fabricante||'',x.registroAnvisa||'',x.unidadeMedida||'',x.observacoes||'');s.status(201).json({id,...x});});
app.get('/pessoa',(q,s)=>s.json(db.prepare('SELECT * FROM people ORDER BY nome').all()));
app.post('/pessoa',(q,s)=>{const x=q.body||{};if(!String(x.nome||'').trim())return s.status(400).json({error:'Informe o nome do paciente.'});const id=x.id||crypto.randomUUID();db.prepare('INSERT OR IGNORE INTO people VALUES(?,?,?,?,?,?)').run(id,String(x.nome).trim(),x.documento||'',x.dataNascimento||'',x.telefone||'',new Date().toISOString());s.status(201).json({id,...x});});
app.get('/prontuario',(q,s)=>s.json(db.prepare('SELECT r.*,p.nome pessoaNome FROM records r LEFT JOIN people p ON p.id=r.pessoaId').all()));
app.get('/prontuario/:id',(q,s)=>{const x=db.prepare('SELECT * FROM records WHERE pessoaId=? OR id=?').get(q.params.id,q.params.id);x?s.json(x):s.status(404).json({error:'Prontuário não encontrado'});});
// Um prontuário é um registro longitudinal por paciente. Um paciente pode ter
// vários atendimentos, mas todos ficam vinculados ao mesmo prontuário.
function saveRecord(x){
 if(!x?.pessoaId) throw new Error('Informe o paciente para criar o prontuário.');
 const patient=db.prepare('SELECT id FROM people WHERE id=?').get(x.pessoaId);
 if(!patient) throw new Error('Paciente não encontrado. Cadastre o paciente antes de criar o prontuário.');
 const existing=db.prepare('SELECT * FROM records WHERE pessoaId=?').get(x.pessoaId);
 if(existing){
  // Preserva informações já preenchidas e complementa somente campos vazios.
  const alergias=existing.alergias||x.alergias||'';
  const historico=existing.historico||x.historico||'';
  if(alergias!==existing.alergias||historico!==existing.historico){
   db.prepare('UPDATE records SET alergias=?,historico=? WHERE pessoaId=?').run(alergias,historico,x.pessoaId);
  }
  return existing.id;
 }
 const id=x.id||crypto.randomUUID();
 db.prepare('INSERT INTO records (id,pessoaId,alergias,historico,createdAt) VALUES(?,?,?,?,?)').run(id,x.pessoaId,x.alergias||'',x.historico||'',new Date().toISOString());
 return id;
}
app.post('/prontuario',(q,s)=>{
 try{const result=db.transaction(()=>({id:saveRecord(q.body||{}),...(q.body||{})}))();s.status(201).json(result)}
 catch(e){s.status(400).json({error:'Não foi possível criar o prontuário.',detail:e.message})}
});
app.get('/atendimento',(q,s)=>s.json(db.prepare('SELECT * FROM attendances ORDER BY updatedAt DESC').all().map(parseAttendance)));
app.get('/atendimento/:id',(q,s)=>s.json(db.prepare('SELECT * FROM attendances WHERE pessoaId=? ORDER BY updatedAt DESC').all(q.params.id).map(parseAttendance)));
function parseAttendance(x){return {...x,medicamentos:JSON.parse(x.medicamentos||'[]')};}
// Strategy: mantém a versão mais recente por updatedAt para um mesmo clientId.
function resolveAttendanceConflict(existing,incoming){
 const oldTime=Date.parse(existing.updatedAt||existing.data||0), newTime=Date.parse(incoming.updatedAt||incoming.data||0);
 return Number.isFinite(newTime)&&newTime>oldTime?'incoming':'existing';
}
function ensureRecordForAttendance(x){
 if(!x?.pessoaId) throw new Error('Atendimento sem paciente vinculado.');
 const historico=[x.historiaAtual,x.antecedentes].filter(v=>String(v||'').trim()).join('\n\n');
 return saveRecord({pessoaId:x.pessoaId,alergias:x.alergias||'',historico});
}
function saveAttendance(x,user){
 // Regra de integridade: nenhum atendimento é persistido sem prontuário do paciente.
 ensureRecordForAttendance(x);
 const existing=db.prepare('SELECT * FROM attendances WHERE clientId=?').get(x.clientId);
 const values={
  pessoaId:x.pessoaId,data:x.data||x.dataHoraInicio||new Date().toISOString(),queixa:x.queixa||'',pressao:x.pressao||'',frequenciaCardiaca:x.frequenciaCardiaca||'',frequenciaRespiratoria:x.frequenciaRespiratoria||'',saturacao:x.saturacao||'',temperatura:x.temperatura||'',glasgow:x.glasgow||'',triagem:x.triagem||'',medicamentos:JSON.stringify(x.medicamentos||[]),observacoes:x.observacoes||'',updatedAt:x.updatedAt||new Date().toISOString(),profissionalId:user.sub,
  tipoAtendimento:x.tipoAtendimento||'',localAtendimento:x.localAtendimento||'',dataHoraInicio:x.dataHoraInicio||x.data||'',dataHoraFim:x.dataHoraFim||'',historiaAtual:x.historiaAtual||'',antecedentes:x.antecedentes||'',alergias:x.alergias||'',exameFisico:x.exameFisico||'',conduta:x.conduta||'',destino:x.destino||'',responsavelEquipe:x.responsavelEquipe||'',acompanhante:x.acompanhante||''
 };
 if(existing){
  if(resolveAttendanceConflict(existing,x)==='incoming'){
   const columns=Object.keys(values);db.prepare(`UPDATE attendances SET ${columns.map(k=>`${k}=@${k}`).join(',')} WHERE clientId=@clientId`).run({...values,clientId:x.clientId});
   return parseAttendance(db.prepare('SELECT * FROM attendances WHERE clientId=?').get(x.clientId));
  }
  return parseAttendance(existing);
 }
 const id=x.id||crypto.randomUUID(),clientId=x.clientId||id;
 const row={id,clientId,...values};const columns=Object.keys(row);
 db.prepare(`INSERT INTO attendances (${columns.join(',')}) VALUES (${columns.map(k=>'@'+k).join(',')})`).run(row);
 return parseAttendance(db.prepare('SELECT * FROM attendances WHERE id=?').get(id));
}
app.post('/atendimento',(q,s)=>{
 try{
  const result=db.transaction(()=>saveAttendance(q.body||{},q.user))();
  s.status(201).json(result);
 }catch(e){s.status(400).json({error:'Atendimento não registrado; confirme o paciente e os dados enviados.',detail:e.message});}
});
app.post('/sync',(q,s)=>{
 const patients=q.body?.patients||[], items=q.body?.items||[];
 if(!Array.isArray(patients)||!Array.isArray(items))return s.status(400).json({error:'Formato de sincronização inválido.'});
 const results=[]; let patientsReceived=0;
 try{
  const apply=db.transaction(()=>{
   for(const p of patients){
    if(!String(p.nome||'').trim())throw new Error('Paciente sem nome na fila de sincronização.');
    const pid=p.id||crypto.randomUUID();
    db.prepare('INSERT OR IGNORE INTO people VALUES(?,?,?,?,?,?)').run(pid,String(p.nome).trim(),p.documento||'',p.dataNascimento||'',p.telefone||'',p.createdAt||new Date().toISOString());
    patientsReceived++;
   }
   for(const item of items){
    const p=item.pessoa||{}, pid=p.id||crypto.randomUUID();
    if(p.nome)db.prepare('INSERT OR IGNORE INTO people VALUES(?,?,?,?,?,?)').run(pid,p.nome,p.documento||'',p.dataNascimento||'',p.telefone||'',p.createdAt||new Date().toISOString());
    const r=item.prontuario||{}; if(r.pessoaId||p.nome)saveRecord({...r,pessoaId:r.pessoaId||pid});
    const a=item.atendimento||{}; if(a.clientId)results.push(saveAttendance({...a,pessoaId:a.pessoaId||pid},q.user));
    else throw new Error('Atendimento sem identificador idempotente (clientId).');
   }
  });
  apply();
  s.json({received:results.length,patientsReceived,attendances:results,failed:[]});
 }catch(e){s.status(400).json({error:'Sincronização não aplicada; transação revertida.',detail:e.message,failed:[e.message]});}
});
// Recupera prontuários ausentes de atendimentos já gravados em versões anteriores.
const missingCharts=db.prepare(`
 SELECT a.pessoaId,a.alergias,a.historiaAtual,a.antecedentes
 FROM attendances a LEFT JOIN records r ON r.pessoaId=a.pessoaId
 WHERE a.pessoaId IS NOT NULL AND r.id IS NULL
 GROUP BY a.pessoaId
`).all();
if(missingCharts.length){
 const restore=db.transaction(()=>{
  for(const a of missingCharts){
   const historico=[a.historiaAtual,a.antecedentes].filter(v=>String(v||'').trim()).join('\n\n');
   saveRecord({pessoaId:a.pessoaId,alergias:a.alergias||'',historico});
  }
 });
 restore();
 console.log(`[Records] ${missingCharts.length} prontuário(s) recuperado(s) a partir de atendimentos existentes.`);
}

app.post('/log',(q,s)=>{const x=q.body;db.prepare('INSERT INTO audit(data_hora,ip,profissional,metodo,rota,status,tempo_ms) VALUES(?,?,?,?,?,?,?)').run(x.data_hora||new Date().toISOString(),x.ip||'offline',q.user.sub,x.metodo||'OFFLINE',x.rota||'offline',x.status||200,x.tempo_ms||0);s.status(201).json({ok:true});});
app.get('/audit',(q,s)=>s.json(db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 500').all()));
app.listen(process.env.PORT||8002,'127.0.0.1',()=>console.log('Records API em http://127.0.0.1:'+ (process.env.PORT||8002)));
