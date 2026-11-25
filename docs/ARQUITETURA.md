# Arquitetura MedicalField

## Visão geral
Frontend React responsivo (desktop/mobile) conversa por REST com três serviços autônomos:
1. Auth API — Python/FastAPI: login, emissão JWT e identidade profissional.
2. Records API — Node.js/Express: pessoas, prontuários, atendimentos, medicamentos, sincronização e auditoria.
3. Documents API — Go/Gin: geração de PDF e envio SMTP.

O cliente web usa Repository Pattern para abstrair IndexedDB e APIs. A Outbox local armazena operações enquanto Offline. O Observer monitora a conectividade/simulador e dispara sincronização quando Online.

## Fluxo offline
1. A interface grava pessoa, prontuário e atendimento no IndexedDB.
2. O atendimento recebe `clientId` UUID e é marcado `PENDING`.
3. Ao voltar Online, a Outbox envia o pacote à rota `/sync`.
4. O servidor usa `clientId` como chave de idempotência; repetir o envio não duplica atendimento. Se o mesmo atendimento chegar com `updatedAt` mais recente, a estratégia atualiza o registro centralizado.
5. O servidor retorna os IDs e o cliente marca o item como sincronizado.

## Padrões de projeto efetivamente utilizados
- Factory: `getLocalDB(mode)` seleciona/cria o banco local do ambiente escolhido.
- Singleton por ambiente: o mapa `instances` mantém uma instância Dexie por banco.
- Adapter: `request()` em `frontend/src/api.ts` padroniza HTTP, token, cabeçalhos e erros.
- Observer: eventos `online`, `offline`, `focus` e `visibilitychange` reagem à conectividade e retomada da sincronização.
- Outbox: operações offline ficam pendentes até confirmação da API.
- Strategy: `resolveAttendanceConflict()` escolhe a versão com `updatedAt` mais recente para um `clientId` repetido.

O Repository Pattern é um padrão sugerido no enunciado, mas a camada de tela ainda chama o adaptador HTTP diretamente; não se afirma que exista uma implementação completa de Repository.

## Segurança e limites
JWT Bearer em todas as rotas protegidas. Middleware de auditoria registra timestamp, IP, profissional, método, rota, status e duração. Os serviços não devem ser expostos à internet nesta versão. Dados clínicos reais exigem avaliação de segurança, privacidade, controles de acesso e conformidade regulatória.


## Ambientes Portal Web e Cliente Mobile (V7)
O endereço apresenta uma seleção a cada carregamento: Portal Web ou Cliente Mobile. Ambos usam os mesmos microsserviços, mas o cliente utiliza IndexedDB próprio (`MedicalFieldMobileLocal`) e o portal não lê a fila local do cliente. O Portal consulta os dados confirmados no servidor. O Cliente Mobile mantém cache local de pessoas, prontuários, atendimentos e medicamentos e uma Outbox para registros pendentes. A simulação offline desativa as chamadas de leitura/sincronização do cliente e permite registrar pessoas e atendimentos localmente.

## Persistência e sincronização
A sincronização envia pacientes e pacotes de ocorrência por `POST /sync`. O servidor aplica cada lote em transação SQLite e utiliza `clientId` único para evitar duplicidade de atendimentos. A fila local só é marcada como sincronizada após resposta HTTP de sucesso. O IndexedDB do Portal é independente (`MedicalFieldWebLocal`) e não participa da sincronização offline.

## Auditoria
Auth e Records persistem auditoria em SQLite. Documents grava logs estruturados de acesso em `documents-access.log`. Os campos incluem data/hora UTC, IP, identificador do profissional autenticado, método, rota, status e duração.

## Vínculo entre prontuário e atendimento (V7.7.1)
O modelo mantém um prontuário longitudinal por paciente (`records.pessoaId` é único). Cada atendimento é armazenado separadamente e vinculado ao mesmo `pessoaId`. Ao receber `POST /atendimento` ou um pacote via `POST /sync`, a Records API garante a existência do prontuário antes de persistir o atendimento. Na rota direta, as duas operações ocorrem na mesma transação SQLite. Na inicialização, registros antigos de atendimento sem prontuário são recuperados automaticamente. A tela Prontuários mostra uma linha por paciente e apresenta o atendimento mais recente.
