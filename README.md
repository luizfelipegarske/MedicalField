# MedicalField — primeira versão local

Aplicação web responsiva (desktop/mobile) para prontuário de emergência, com modo offline e sincronização.


## Versão 7.7.1 — vínculo automático de prontuários e atendimentos
- A Records API cria automaticamente o prontuário longitudinal do paciente ao gravar um atendimento, caso ainda não exista.
- A gravação do atendimento e a criação do prontuário são realizadas na mesma transação SQLite; em caso de erro, nenhuma das duas operações fica parcialmente gravada.
- Na inicialização, a API recupera prontuários ausentes de atendimentos antigos.
- A listagem esclarece que existe um prontuário por paciente e que novos atendimentos são vinculados a ele.

## Versão 7.7.0 — ajustes de interface e registros
- A entrada Web usa `web.html` como `dist/index.html` e abre diretamente o login; não há seletor de plataforma.
- A entrada Mobile é publicada em `dist/mobile.html` e usa um layout estreito, centralizado e otimizado para toque mesmo em navegador desktop. Em celular ocupa toda a largura disponível.
- Cadastro de atendimento ampliado com tipo, local, horários, responsável/equipe, acompanhante, história atual, antecedentes, alergias, avaliação objetiva, conduta e destino, além dos sinais vitais já existentes.
- Cadastro de medicamento ampliado com princípio ativo, concentração, forma farmacêutica, apresentação, fabricante, registro ANVISA, unidade de medida e observações.
- A API Records aplica migrações SQLite incrementais ao iniciar, adicionando as novas colunas sem apagar os registros já existentes.
- PDF reorganizado em seções, campos destacados, quadro de sinais vitais, tabela de medicações, paginação, rodapé e campos de assinatura.

A ficha é um modelo de registro e não substitui prontuário regulamentado, protocolos institucionais, validação profissional ou requisitos legais de segurança e privacidade. Os campos são preenchidos pelo profissional; o sistema não prescreve nem valida doses.

## Publicação 7.7.0 na VM
O procedimento de atualização permanece pelo `update.sh`. Antes de executar, faça backup e confirme que a VM tem acesso às dependências npm e Go. Ao iniciar o serviço Records, as colunas novas são adicionadas automaticamente ao SQLite existente. O script recompila o frontend e publica `index.html` (Web) e `mobile.html` (Mobile) no diretório estático.

## Requisitos
- Windows 10/11
- VSCode
- Python 3.11+
- Node.js 20+
- Go 1.22+
- Navegador Chromium recomendado

## Serviços e portas
- Frontend: http://localhost:5173
- Auth API (Python/FastAPI): http://localhost:8001
- Records API (Node/Express): http://localhost:8002
- Documents API (Go/Gin): http://localhost:8003

Cada serviço usa SQLite próprio. O frontend mantém dados pendentes no IndexedDB (Dexie).
Esta versão é acadêmica/demonstrativa: não utilizar com pacientes reais. Não substitui protocolos clínicos nem valida dosagens.

## 1. Configurar variáveis
Copie cada arquivo `.env.example` para `.env` dentro das pastas `services/auth`, `services/records` e `services/documents`. Configure exatamente o mesmo `JWT_SECRET` forte nos três serviços. O frontend usa as URLs locais fixas.

## 2. Iniciar APIs (três terminais no VSCode)

### Auth API
```powershell
cd services/auth
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app:app --reload --port 8001
```
Se o PowerShell bloquear a ativação, execute `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` no terminal atual.

### Records API
```powershell
cd services/records
npm install
npm run dev
```

### Documents API
```powershell
cd services/documents
go mod tidy
go run .
```

## 3. Iniciar frontend (quarto terminal)
```powershell
cd frontend
npm install
npm run dev
```
Acesse http://localhost:5173.

## Credenciais de demonstração
- Identificador: `admin`
- Senha: `admin`

A conta é exclusivamente demonstrativa. Não use credenciais padrão em ambiente real.

## Funcionalidades implementadas
- Login JWT para profissional identificado por CRM/COREN/ID de socorrista.
- Portal administrativo e interface de atendimento em layout responsivo.
- Cadastro e listagem de pacientes; o atendimento seleciona um paciente previamente cadastrado.\n- Cadastro de medicamentos e inclusão individual de medicações no atendimento, com dose, via, frequência/horário e observações.\n- Seleção de vários prontuários para envio conjunto por e-mail e botão de PDF em cada prontuário.
- Catálogo de medicamentos.
- Modo online/offline simulado.
- Persistência local IndexedDB e fila Outbox.
- Sincronização idempotente por `clientId` do atendimento.
- Logs de acesso nas APIs e envio de logs offline.
- Geração de ficha PDF e envio por e-mail (SMTP configurável).
- Documentação da arquitetura, APIs, dados e roteiro de demonstração.

## SMTP (envio de prontuários)
Configure as variáveis no arquivo `services/documents/.env` (não compartilhe esse arquivo nem a senha):

- `SMTP_HOST`: servidor SMTP informado pelo provedor.
- `SMTP_PORT`: normalmente 587 para STARTTLS ou 465 para TLS implícito.
- `SMTP_TLS_MODE`: `starttls` para porta 587, `ssl` para porta 465; `auto` escolhe pelo número da porta. `none` é somente para testes em rede confiável.
- `SMTP_USER`: usuário de autenticação SMTP.
- `SMTP_PASSWORD`: senha SMTP ou senha de aplicativo emitida pelo provedor.
- `SMTP_FROM`: endereço remetente autorizado, por exemplo `MedicalField <conta@dominio.com>`.

O serviço Documents carrega esse `.env` ao iniciar. Após alterar as configurações, reinicie a aplicação (`./stop.sh` e `./start.sh`). O envio usa TLS, autenticação quando configurada, validação de remetente/destinatário e anexa um PDF por prontuário selecionado. A API retorna erro explícito se a configuração ou autenticação SMTP falhar.

A conta, senha e servidor dependem do provedor de e-mail utilizado. Não coloque credenciais reais no código-fonte, no ZIP ou no Git.

## Roteiro de demonstração
1. Entre no portal com as credenciais de demonstração.
2. Consulte pessoas, prontuários e atendimentos.
3. Abra a área de atendimento, crie uma pessoa/prontuário/atendimento online e sincronize.
4. Cadastre um paciente e um ou mais medicamentos pelas respectivas telas.
5. Ative o simulador Offline e registre um atendimento; confirme que fica na fila local.
6. Volte para Online e clique em Sincronizar; confira o novo atendimento no portal.
7. Gere o PDF e teste o envio de e-mail com SMTP configurado.

## Observações técnicas
- O botão Online/Offline é um simulador de conectividade da aplicação, não desliga a rede do Windows.
- O service worker/PWA requer HTTPS ou localhost. O IndexedDB persiste no navegador.
- Estratégia de conflito inicial: merge por campo usando `updatedAt` mais recente; conflitos são sinalizados no retorno. Em caso de empate, mantém o registro já centralizado.
- JWT e senha de demonstração são para desenvolvimento. Troque os segredos antes de qualquer implantação.
- A implantação na VM Univates, HTTPS, proxy reverso, backups, gestão de segredos e controles LGPD devem ser tratados na próxima versão.


## V7 - Portal Web e Cliente Mobile
Ao acessar o endereço, escolha Portal Web Administrativo ou Cliente Mobile/Offline. O Portal apresenta somente dados confirmados no servidor. O Cliente Mobile utiliza armazenamento local próprio e mantém a Outbox até confirmação da API. Os bancos IndexedDB têm nomes distintos por ambiente; é possível abrir Portal e Mobile em abas diferentes do mesmo navegador, escolhendo um ambiente em cada aba. A escolha é apresentada a cada novo carregamento da aplicação.

**Configuração de segurança:** configure o mesmo `JWT_SECRET` forte nos serviços Auth, Records e Documents. Nunca use o segredo demonstrativo em ambientes expostos. As credenciais `admin/admin` são exclusivamente demonstrativas e devem ser alteradas antes de qualquer uso real.

## Versão com Web e Mobile separados

A partir desta versão, o Portal Web e o Cliente Mobile são entradas independentes:

- Portal Web: `/` (arquivo `frontend/index.html`, entrada `src/web.tsx`)
- Cliente Mobile/PWA: `/mobile/` (entrada `mobile.html`, `src/mobile.tsx`)
- O Mobile usa IndexedDB/Dexie e a fila Outbox existente. O Service Worker cacheia o shell e recursos estáticos; as rotas `/api/` não são cacheadas.
- O Mobile pode ser aberto no navegador para demonstração e instalado como PWA quando servido por HTTPS ou `localhost`.

### Desenvolvimento local

```bash
cd frontend
npm install
npm run dev
```

Abra `http://localhost:5173/` para Web e `http://localhost:5173/mobile.html` para Mobile. O Vite mantém os proxies `/api/auth`, `/api/records` e `/api/docs`.

### Build de produção

```bash
cd frontend
npm ci
npm run build
```

O build gera as entradas `index.html` e `mobile.html`, além dos recursos em `dist/assets`. Para publicar o Mobile em `/mobile/`, configure o servidor para servir `mobile.html` como índice dessa rota e disponibilizar `sw.js`, `manifest.webmanifest` e `mobile-icon.svg` dentro do escopo `/mobile/`. Veja `docs/DEPLOY_WEB_MOBILE.txt`.

**Atenção:** o Service Worker e a instalação PWA exigem HTTPS (exceto `localhost`). O endereço HTTP da VM pode servir a demonstração online, mas não garante o modo offline completo no celular. Protótipo acadêmico; não usar dados reais de pacientes.
