# Roteiro de testes MedicalField

1. Acessar o endereço e confirmar a tela de escolha Web/Mobile em cada carregamento.
2. Abrir uma aba e selecionar Portal Web; autenticar e listar pacientes, prontuários, atendimentos e medicamentos.
3. Abrir outra aba no mesmo navegador, selecionar Cliente Mobile e autenticar. Os ambientes usam bancos IndexedDB diferentes mesmo na mesma origem.
4. Com o Mobile online, sincronizar/receber os cadastros existentes do Portal.
5. No Mobile online, registrar atendimento e confirmar sua visualização no Portal.
6. No Mobile, ativar Simular offline e cadastrar pessoa, prontuário e atendimento com dados fictícios.
7. Confirmar que os registros offline aparecem no Mobile, com pendência, mas não aparecem no Portal.
8. Desativar Simular offline e aguardar a sincronização.
9. Confirmar que o Portal passa a listar os novos registros e que a fila Mobile foi concluída.
10. Repetir a sincronização para verificar idempotência (não deve duplicar atendimentos).
11. Inserir medicamento no banco central e atualizar o Mobile para receber o cadastro.
12. Gerar PDF individual e testar envio por e-mail com SMTP configurado.
13. Conferir logs de acesso nos serviços Auth, Records e Documents.
14. Validar autenticação: chamadas protegidas sem token devem retornar HTTP 401; `/auth/login` permanece público.

Usar somente dados fictícios. O projeto é um protótipo acadêmico e não está validado para uso assistencial real.
