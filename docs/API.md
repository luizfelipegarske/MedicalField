# APIs

Todas as rotas, exceto `POST /auth/login`, exigem `Authorization: Bearer <JWT>`.

## Auth — http://localhost:8001
- `POST /auth/login` `{ "identifier":"SOC-001", "password":"Medical123!" }`
- `GET /health` health check (infraestrutura)

## Records — http://localhost:8002
- `GET /medicamento`
- `POST /medicamento` `{ "nome":"...", "concentracao":"..." }` — cadastra item no catálogo.
- `GET /pessoa`
- `POST /pessoa` `{ "nome":"...", "documento":"...", "dataNascimento":"...", "telefone":"..." }`
- `GET /prontuario`
- `GET /prontuario/{id}`
- `POST /prontuario` `{ "pessoaId":"...", "alergias":"...", "historico":"..." }`
- `GET /atendimento` lista geral
- `GET /atendimento/{pessoaId}` atendimentos da pessoa
- `POST /atendimento` objeto com `clientId`, `pessoaId`, `queixa`, `pressao`, `frequenciaCardiaca`, `frequenciaRespiratoria`, `saturacao`, `temperatura`, `glasgow`, `triagem`, `medicamentos`, `observacoes`
  - Ao salvar um atendimento, a API garante a existência de um prontuário para o paciente. Se ainda não existir, cria-o automaticamente na mesma transação do atendimento.
  - O modelo mantém um prontuário longitudinal por paciente (`pessoaId` único); múltiplos atendimentos ficam associados ao mesmo prontuário.
- `POST /sync` `{ "items":[{ "pessoa":{}, "prontuario":{}, "atendimento":{} }] }`
- `POST /log` recebe logs criados offline
- `GET /audit` lista auditoria (somente token válido nesta versão)

## Documents — http://localhost:8003
- `POST /pdf` `{ "atendimento":{...}, "pessoa":{...}, "profissional":"..." }` retorna `application/pdf`.
- `POST /email` aceita `{ "to":"destinatario@exemplo.com", "items":[{ "atendimento":{}, "pessoa":{} }], "profissional":"..." }` e envia um PDF por item no mesmo e-mail. O formato antigo com `atendimento` e `pessoa` continua aceito.

## Exemplo login
```http
POST http://localhost:8001/auth/login
Content-Type: application/json

{"identifier":"SOC-001","password":"Medical123!"}
```


## Sincronização offline
`POST /sync` (autenticado) recebe `{ "patients": [...], "items": [...] }`. Cada item contém `pessoa`, `prontuario` e `atendimento`; o atendimento deve conter `clientId` estável. O endpoint aplica o lote em transação e retorna `received`, `patientsReceived`, `attendances` e `failed`. Em caso de falha, a transação é revertida e a fila local permanece pendente.

`POST /log` (autenticado) recebe logs gerados localmente para consolidação da auditoria. `GET /audit` (autenticado) lista os últimos registros de auditoria. O serviço Documents oferece `POST /pdf` e `POST /email`, ambos autenticados.
