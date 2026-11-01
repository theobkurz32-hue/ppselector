# Operação do servidor compartilhado

As rotinas abaixo requerem acesso ao terminal da hospedagem. Não são endpoints públicos. O GitHub Pages continua estático; só a hospedagem com Python, HTTPS e disco persistente executa o banco e as permissões. Nenhuma hospedagem paga foi criada por estes arquivos.

## Migração e regras de dados

Ao abrir um banco existente, o servidor migra o JSON do projeto para a versão 2 sem sobrescrever quantidades, preços, progresso e datas já gravados. Uma migração incrementa a revisão para que clientes antigos recebam um conflito antes de tentar salvar sobre a nova estrutura. O arquivo original continua sendo referência dos identificadores e descrições confiáveis.

A linha-base usa pesos originais em reais, com arredondamento por insumo em centavos, e os períodos e o calendário originais. A linha-base contém exatamente `approvedAt`, `weights`, `tasks` e `calendar`; o calendário de referência fica congelado junto com os pesos e as datas. Alterar feriados do planejamento atual não altera retroativamente a curva física prevista da linha-base. Ela começa sem data de aprovação (`approvedAt: null`). Alterar o orçamento não muda os pesos da linha-base. Somente um administrador pode aprová-la ou redefini-la; um editor que tente alterá-la recebe 403. O endpoint `PUT /api/project/restore` é exclusivo de administrador e registra `project.restore` na auditoria.

O servidor valida os vínculos de despesas a serviços existentes, os valores inteiros em centavos, as datas e os estados a pagar/pago. Também valida o calendário de feriados e o grafo de dependências, rejeitando ciclos, referências inexistentes e atividades sem dia útil. Migrações preservam períodos antigos, mesmo que precisem de revisão posterior; novas gravações devem respeitar o calendário.

## Tentativas de acesso e proxy

O bloqueio temporário considera **falhas**: cinco por usuário e trinta por IP em quinze minutos. Logins corretos não consomem esse limite. Há ainda limite independente de volume, de 120 requisições de login por IP em um minuto, para limitar o trabalho de hashing mesmo quando as credenciais são válidas.

Configure `RIVIERA_TRUSTED_PROXIES` com os endereços/CIDRs confirmados do proxy reverso da hospedagem. O padrão aceita apenas loopback; não há confiança irrestrita em cabeçalhos enviados pelo cliente. A identidade real do IP deve ser validada na hospedagem antes de divulgar o endereço. Não altere para `*` sem uma cadeia de proxy que impeça o cliente de controlar os cabeçalhos.

PIN de cinco números foi preservado por preferência do produto. Isso não equivale a uma senha forte ou MFA; para informação confidencial, a evolução recomendada continua sendo um provedor de identidade com autenticação mais forte. Não coloque PINs ou tokens em argumentos de comandos, repositório, chat ou logs.

## Backup completo consistente

O JSON exportado pela interface contém a obra, não contas e auditoria. Para guardar o banco completo, execute no terminal autorizado, com pasta de destino privada já criada:

```sh
python -m server.manage backup \
  --database /var/data/riviera.sqlite3 \
  --output /var/data/backups/riviera-AAAA-MM-DD.sqlite3
```

O comando usa `sqlite3.Connection.backup`, inclui as transações confirmadas no WAL e verifica `PRAGMA integrity_check`. Não sobrescreve arquivos existentes e cria o backup com permissão 0600. Nunca copie apenas o arquivo principal enquanto o serviço está em uso, pois isso pode omitir o WAL.

Faça backup diário e antes de migrações, recuperação ou restauração. Guarde uma cópia fora do volume do servidor em armazenamento privado apropriado. Manter o backup no mesmo disco não protege contra perda do volume. A execução agendada e o armazenamento externo devem ser configurados pelo responsável na hospedagem; este repositório não contrata nem configura uma conta externa automaticamente.

## Restaurar banco completo

1. Pare o serviço web na hospedagem. Mantenha apenas o terminal administrativo ativo.
2. Se houver WAL/SHM do banco antigo, consolide com o serviço parado:

   ```sh
   python -m server.manage checkpoint \
     --database /var/data/riviera.sqlite3 --server-stopped
   ```

3. Restaure o snapshot escolhido:

   ```sh
   python -m server.manage restore \
     --database /var/data/riviera.sqlite3 \
     --backup /var/data/backups/riviera-AAAA-MM-DD.sqlite3 \
     --server-stopped --confirm
   ```

4. O comando verifica a origem e a integridade, preserva uma cópia `before-restore` do destino existente, prepara o novo banco em arquivo temporário e faz substituição atômica. Ele recusa operar se houver WAL/SHM no destino. **Não apague esses arquivos manualmente.**
5. Todas as sessões do banco restaurado são encerradas. Reinicie o serviço e confirme login, contas, revisão e valores da obra antes de voltar a usar.

A flag `--server-stopped` é uma confirmação operacional, não uma detecção mágica de processos externos. Um processo ocioso com conexão aberta pode ser impossível de identificar pelo CLI. O serviço deve ser realmente interrompido para evitar acessos ao inode antigo durante a substituição.

## Recuperar administrador

Execute no terminal da hospedagem:

```sh
python -m server.manage recover-admin \
  --database /var/data/riviera.sqlite3 --username nome.existente
```

O PIN novo e a confirmação são digitados em dois prompts `getpass`, sem eco. Não há opção `--pin`. A rotina recupera uma conta existente como administrador ativo, troca seu hash, remove suas sessões e registra `user.recover`, sem registrar o PIN. Ela não cria um usuário arbitrário nem oferece recuperação sem acesso administrativo ao servidor. Depois, entre novamente e confira os demais acessos.

## Retenção de auditoria

Defina a retenção conforme os deveres de guarda da obra. Como ponto de partida operacional, mantenha um ano de histórico on-line e backups de acordo com a política do responsável. A aplicação não remove histórico antigo silenciosamente durante atualizações. Depois de fazer e guardar um backup, um operador pode aplicar a retenção explicitamente:

```sh
python -m server.manage prune-audit \
  --database /var/data/riviera.sqlite3 --older-than-days 365 --confirm
```

Os registros removidos só poderão ser consultados nos backups guardados. O intervalo permitido vai de 30 a 3650 dias.

## Verificações de regressão

```sh
python -m unittest server.test_api server.test_model server.test_manage -v
```

Os testes usam bancos temporários. Cobrem persistência da migração, despesas e centavos, permissões e restauração administrativa, dependências sem ciclos, calendários, logins corretos acima de trinta acessos, bloqueio de falhas, recuperação sem PIN em argumentos e backup/restauração completos com WAL.

## Snapshots automáticos no serviço

`render.yaml` habilita `RIVIERA_BACKUP_DIR=/var/data/backups`. Com o servidor real em execução, o ciclo de vida cria um snapshot consistente na inicialização e repete a cada 86.400 segundos. `RIVIERA_BACKUP_INTERVAL_SECONDS` permite intervalos entre 60 segundos e 31 dias; `RIVIERA_BACKUP_KEEP` mantém de 1 a 90 snapshots, com padrão de sete. A rotação remove somente arquivos próprios com prefixo `riviera-auto-`, sem remover cópias manuais.

O trabalho roda fora do event loop, com pasta 0700 e arquivos 0600. `/healthz` informa o estado e o último sucesso; uma falha marca `status: degraded`, preserva o servidor funcionando e gera log apenas com o tipo da exceção. O responsável deve monitorar esse estado. A primeira cópia é criada após a preparação/migração do banco no startup.

**Essas cópias usam o mesmo volume:** protegem contra alterações indevidas e permitem restaurações, mas não protegem contra perda total do disco, da conta ou do provedor. Configure também uma cópia externa privada, agendada pelo operador/provedor, e faça ensaios de restauração. Nenhuma cópia externa foi contratada ou ativada automaticamente.
