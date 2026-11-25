
export const openapiSpecification = {
  openapi: '3.0.3',
  info: {
    title: 'MedicalField Records API',
    version: '1.0.0',
    description: 'API de gerenciamento de pacientes, medicamentos, prontuários, atendimentos, sincronização e auditoria.'
  },
  servers: [
    { url: '/api/records', description: 'Acesso externo pelo Nginx' }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Informe o token JWT obtido na API Auth.'
      }
    },
    schemas: {
      Paciente: {
        type: 'object',
        required: ['nome'],
        properties: {
          id: { type: 'string', example: 'uuid-paciente' },
          nome: { type: 'string', example: 'Paciente de demonstração' },
          documento: { type: 'string', example: '00000000000' },
          dataNascimento: { type: 'string', example: '1990-01-15' },
          telefone: { type: 'string', example: '51999999999' }
        }
      },
      Medicamento: {
        type: 'object',
        required: ['nome'],
        properties: {
          nome: { type: 'string', example: 'Medicamento de demonstração' },
          concentracao: { type: 'string', example: '500 mg' }
        }
      },
      Prontuario: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          pessoaId: { type: 'string', example: 'uuid-paciente' },
          alergias: { type: 'string', example: 'Nenhuma informada' },
          historico: { type: 'string', example: 'Registro de demonstração' }
        }
      },
      Atendimento: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          clientId: { type: 'string', example: 'uuid-atendimento' },
          pessoaId: { type: 'string', example: 'uuid-paciente' },
          data: { type: 'string', format: 'date-time' },
          queixa: { type: 'string' },
          pressao: { type: 'string', example: '120/80' },
          frequenciaCardiaca: { type: 'string', example: '80 bpm' },
          frequenciaRespiratoria: { type: 'string' },
          saturacao: { type: 'string', example: '98%' },
          temperatura: { type: 'string', example: '36.5' },
          glasgow: { type: 'string', example: '15' },
          triagem: { type: 'string', example: 'Amarelo' },
          medicamentos: { type: 'array', items: { type: 'object' } },
          observacoes: { type: 'string' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      Sincronizacao: {
        type: 'object',
        properties: {
          patients: {
            type: 'array',
            items: { $ref: '#/components/schemas/Paciente' }
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                pessoa: { $ref: '#/components/schemas/Paciente' },
                prontuario: { $ref: '#/components/schemas/Prontuario' },
                atendimento: { $ref: '#/components/schemas/Atendimento' }
              }
            }
          }
        }
      },
      Log: {
        type: 'object',
        properties: {
          data_hora: { type: 'string', format: 'date-time' },
          ip: { type: 'string' },
          metodo: { type: 'string' },
          rota: { type: 'string' },
          status: { type: 'integer' },
          tempo_ms: { type: 'number' }
        }
      }
    }
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': {
      get: {
        tags: ['Sistema'],
        summary: 'Verificar disponibilidade da API',
        security: [],
        responses: { '200': { description: 'Serviço disponível' } }
      }
    },
    '/pessoa': {
      get: {
        tags: ['Pacientes'],
        summary: 'Listar pacientes',
        responses: { '200': { description: 'Lista de pacientes' } }
      },
      post: {
        tags: ['Pacientes'],
        summary: 'Cadastrar paciente',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Paciente' }
            }
          }
        },
        responses: {
          '201': { description: 'Paciente cadastrado' },
          '400': { description: 'Nome não informado' },
          '401': { description: 'Não autenticado' }
        }
      }
    },
    '/medicamento': {
      get: {
        tags: ['Medicamentos'],
        summary: 'Listar medicamentos',
        responses: { '200': { description: 'Lista de medicamentos' } }
      },
      post: {
        tags: ['Medicamentos'],
        summary: 'Cadastrar medicamento',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Medicamento' }
            }
          }
        },
        responses: {
          '201': { description: 'Medicamento cadastrado' },
          '400': { description: 'Nome não informado' },
          '401': { description: 'Não autenticado' }
        }
      }
    },
    '/prontuario': {
      get: {
        tags: ['Prontuários'],
        summary: 'Listar prontuários',
        responses: { '200': { description: 'Lista de prontuários' } }
      },
      post: {
        tags: ['Prontuários'],
        summary: 'Cadastrar prontuário',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Prontuario' }
            }
          }
        },
        responses: {
          '201': { description: 'Prontuário cadastrado' },
          '401': { description: 'Não autenticado' }
        }
      }
    },
    '/prontuario/{id}': {
      get: {
        tags: ['Prontuários'],
        summary: 'Consultar prontuário por pessoa ou identificador',
        parameters: [{
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' }
        }],
        responses: {
          '200': { description: 'Prontuário encontrado' },
          '404': { description: 'Prontuário não encontrado' }
        }
      }
    },
    '/atendimento': {
      get: {
        tags: ['Atendimentos'],
        summary: 'Listar atendimentos',
        responses: { '200': { description: 'Lista de atendimentos' } }
      },
      post: {
        tags: ['Atendimentos'],
        summary: 'Registrar atendimento',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Atendimento' }
            }
          }
        },
        responses: {
          '201': { description: 'Atendimento registrado' },
          '401': { description: 'Não autenticado' }
        }
      }
    },
    '/atendimento/{id}': {
      get: {
        tags: ['Atendimentos'],
        summary: 'Consultar atendimentos de uma pessoa',
        parameters: [{
          name: 'id',
          in: 'path',
          required: true,
          description: 'Identificador da pessoa',
          schema: { type: 'string' }
        }],
        responses: { '200': { description: 'Atendimentos encontrados' } }
      }
    },
    '/sync': {
      post: {
        tags: ['Sincronização'],
        summary: 'Sincronizar dados registrados offline',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Sincronizacao' }
            }
          }
        },
        responses: {
          '200': { description: 'Sincronização processada' },
          '400': { description: 'Formato inválido ou transação revertida' },
          '401': { description: 'Não autenticado' }
        }
      }
    },
    '/log': {
      post: {
        tags: ['Auditoria'],
        summary: 'Registrar log de operação offline',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Log' }
            }
          }
        },
        responses: {
          '201': { description: 'Log registrado' },
          '401': { description: 'Não autenticado' }
        }
      }
    },
    '/audit': {
      get: {
        tags: ['Auditoria'],
        summary: 'Consultar registros de auditoria',
        responses: { '200': { description: 'Últimos 500 registros de auditoria' } }
      }
    }
  }
};

