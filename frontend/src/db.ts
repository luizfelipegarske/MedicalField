import Dexie, {Table} from 'dexie';
export type LocalItem={id:string;kind:'bundle'|'patient';payload:any;status:'PENDING'|'SYNCED';createdAt:string};
export type LocalPerson={id:string;nome:string;documento?:string;dataNascimento?:string;telefone?:string;createdAt?:string;syncStatus?:'PENDING'|'SYNCED'};
export class MedicalDB extends Dexie {
  outbox!:Table<LocalItem,string>;
  people!:Table<LocalPerson,string>;
  records!:Table<any,string>;
  attendances!:Table<any,string>;
  medicines!:Table<any,string>;
  constructor(name:string){
    super(name);
    this.version(1).stores({outbox:'id,status,createdAt,kind',people:'id,nome,documento,syncStatus',records:'id,pessoaId',attendances:'id,pessoaId,updatedAt',medicines:'id,nome'});
  }
}
const instances=new Map<string,MedicalDB>();
export function getLocalDB(mode:'web'|'mobile'){
  const name=mode==='mobile'?'MedicalFieldMobileLocal':'MedicalFieldWebLocal';
  if(!instances.has(name))instances.set(name,new MedicalDB(name));
  return instances.get(name)!;
}
