import type {MedicalDB} from './db';
import {recordsApi} from './api';

export async function queueBundle(db:MedicalDB,payload:any){
  await db.transaction('rw',db.outbox,db.people,db.records,db.attendances,async()=>{
    if(payload.pessoa) await db.people.put({...payload.pessoa,syncStatus:'PENDING'});
    if(payload.prontuario) await db.records.put(payload.prontuario);
    if(payload.atendimento) await db.attendances.put(payload.atendimento);
    await db.outbox.put({id:payload.atendimento.clientId,kind:'bundle',payload,status:'PENDING',createdAt:new Date().toISOString()});
  });
}
export async function queuePatient(db:MedicalDB,patient:any){
  await db.transaction('rw',db.outbox,db.people,async()=>{
    await db.people.put({...patient,createdAt:patient.createdAt||new Date().toISOString(),syncStatus:'PENDING'});
    await db.outbox.put({id:`patient:${patient.id}`,kind:'patient',payload:{pessoa:patient},status:'PENDING',createdAt:new Date().toISOString()});
  });
}
export async function syncOutbox(db:MedicalDB){
  const pending=await db.outbox.where('status').equals('PENDING').toArray();
  if(!pending.length)return 0;
  const patients=pending.filter(x=>x.kind==='patient').map(x=>x.payload.pessoa);
  const items=pending.filter(x=>x.kind==='bundle').map(x=>x.payload);
  const response=await recordsApi('/sync',{method:'POST',body:JSON.stringify({patients,items})});
  const result=await response.json();
  if(result.failed?.length) throw new Error('Alguns registros não foram sincronizados.');
  await db.transaction('rw',db.outbox,db.people,async()=>{
    for(const item of pending){
      await db.outbox.update(item.id,{status:'SYNCED'});
      if(item.kind==='patient') await db.people.update(item.payload.pessoa.id,{syncStatus:'SYNCED'});
      if(item.kind==='bundle'&&item.payload.pessoa) await db.people.update(item.payload.pessoa.id,{syncStatus:'SYNCED'});
    }
  });
  return pending.length;
}
