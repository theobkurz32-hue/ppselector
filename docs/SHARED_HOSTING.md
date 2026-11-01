# Login e dados compartilhados

A implementação está pronta para hospedar o site e o servidor juntos, na mesma origem HTTPS. O GitHub Pages atual não executa este servidor e continua sendo uma versão local, sem autenticação compartilhada. Subir os arquivos no GitHub não ativa o banco ou os usuários na internet.

## Hospedar no Render

A configuração completa está em `render.yaml`. Ela usa **um serviço web pago, plano Starter, e um disco persistente de 1 GB**. Consulte o preço atual no Render e confirme a contratação lá; nada foi contratado ou provisionado automaticamente. Um serviço gratuito com disco efêmero não é adequado: perderia contas e alterações ao reiniciar.

1. Crie uma conta em <https://render.com> ou entre na sua conta.
2. Selecione **New → Blueprint**, conecte o GitHub e escolha `theobkurz32-hue/ppselector`, branch `main`. O Render lerá `render.yaml`.
3. Confira o plano pago e o disco persistente antes de confirmar.
4. Nas variáveis solicitadas, cadastre diretamente no painel seguro do Render:
   - `RIVIERA_ADMIN_USER`: nome do primeiro administrador, com 3–40 letras, números, ponto, hífen ou sublinhado, sem espaços.
   - `RIVIERA_ADMIN_PIN`: exatamente cinco números. Zeros iniciais são preservados. Não envie o PIN pelo chat nem o coloque no GitHub.
5. Crie os recursos e aguarde o deploy concluir. O servidor exige essas duas variáveis se ainda não existir nenhuma conta. O PIN inicial é convertido em hash; as variáveis não redefinem contas existentes durante um novo deploy.
6. Abra a URL HTTPS que o próprio Render fornecer. O nome final do endereço depende da disponibilidade do nome no provedor; não foi reservado um domínio antecipadamente.
7. Entre com o administrador e toque em **Acessos** para criar as demais contas. Confirme leitor e editor em dois navegadores diferentes antes de compartilhar o novo link.
8. Em **Insumos**, abra a fase e o subitem e edite a quantidade ou o preço. Em outro navegador, toque em **Atualizar**; ele deve mostrar a alteração. O site também consulta novas versões quando volta ao primeiro plano, desde que não haja um formulário aberto.
9. Ao confirmar o funcionamento, passe a usar o link novo. O GitHub Pages anterior continua independente. Se desejar encerrar o acesso à versão antiga, desative Pages em Settings → Pages. Isso não torna privado o conteúdo já publicado no histórico de um repositório público.

Se usar domínio próprio, configure `RIVIERA_PUBLIC_ORIGIN` com a origem HTTPS exata, sem barra final (por exemplo, `https://obra.seudominio.com`). Sem essa variável, o Render fornece `RENDER_EXTERNAL_URL`, usado para validar a origem das requisições. Configure no painel o domínio e o certificado antes de divulgar o endereço.

## Perfis

| Perfil | Acesso |
| --- | --- |
| Leitor | Consulta dashboard, orçamento, plano, insumos e premissas; exporta os dados que pode consultar. |
| Editor | Também altera quantidade, preço, datas, progresso, área e reserva. |
| Administrador | Também cria contas, redefine PINs, altera perfis, bloqueia acessos e consulta o histórico. |

Não há cadastro público. O administrador atribui o PIN e o comunica ao usuário por um canal privado. O usuário entra com nome e PIN. Ao alterar PIN, perfil ou estado de uma conta, o servidor encerra as sessões dessa conta. A aplicação protege o último administrador ativo contra bloqueio ou rebaixamento. A sessão dura oito horas; depois é necessário entrar novamente.

Um PIN de cinco números tem apenas 100 mil combinações. Este servidor mantém cinco falhas por usuário e trinta falhas por endereço de origem por janela de quinze minutos (logins corretos não consomem esse limite), com bloqueio temporário. PINs têm hash scrypt com sal individual, e as sessões usam tokens aleatórios cujo hash fica no banco. A sessão fica em cookie HttpOnly, Secure e SameSite=Strict; não em localStorage. Requisições que modificam dados exigem um cabeçalho próprio e origem correspondente, e a API não habilita CORS. As permissões são verificadas no servidor, inclusive quando alguém chama a API diretamente. Essas medidas não tornam um PIN curto equivalente a uma senha forte ou MFA.

## Persistência, conflitos e migração

O SQLite fica em `/var/data/riviera.sqlite3`, dentro do disco persistente. Use **uma única instância** do serviço; não escale horizontalmente com arquivos SQLite independentes. Para múltiplas instâncias, será necessária uma migração para PostgreSQL ou outro banco centralizado.

O servidor importa `data/project.json` ao criar o banco vazio e o usa como referência confiável dos identificadores nas validações. Depois, atualizações do site não sobrescrevem a obra. Cada salvamento compara a revisão do banco; se outra pessoa já salvou, a API retorna conflito sem substituir os dados dela. O usuário recebe a orientação para atualizar e refazer sua alteração. As alterações confirmadas ficam registradas com usuário, horário, item, campo, valor anterior e valor novo.

Alterações antigas feitas no celular não são migradas automaticamente. Antes de trocar de endereço, use **Backup** na versão antiga e guarde o JSON. Depois, entre como administrador no site novo e use **Restaurar**, conferindo os valores antes de confirmar. A restauração usa os mesmos campos editáveis e validações de uma edição e é registrada no histórico. O modo compartilhado precisa de conexão; ele não usa cache offline nem guarda os dados privados em localStorage.

Faça backups do disco/banco com o recurso do provedor, além dos backups JSON do projeto. O JSON preserva a obra, mas não inclui contas, PINs, sessões ou auditoria. Para uma cópia consistente manual do banco SQLite em execução, use a API `sqlite3.Connection.backup`, não copie apenas o arquivo principal e ignore o WAL.

## Desenvolvimento e verificações

Python 3.12. Instale com:

```sh
python3 -m venv /workspace/.venvs/ppselector-shared
/workspace/.venvs/ppselector-shared/bin/pip install -r server/requirements.txt
```

Para rodar em um computador local, defina `RIVIERA_DB_PATH` em um caminho fora dos arquivos públicos e configure `RIVIERA_ADMIN_USER` e `RIVIERA_ADMIN_PIN` no ambiente por um mecanismo seguro. `RIVIERA_ALLOW_HTTP=1` é permitido apenas para desenvolvimento em loopback. Em seguida execute, da raiz do repositório:

```sh
python3 -m server.run
```

A hospedagem usa HTTPS e **não** define `RIVIERA_ALLOW_HTTP`. `PORT` seleciona a porta; o padrão é 8000. Configure `RIVIERA_TRUSTED_PROXIES` com os endereços reais do proxy reverso se necessário. O servidor não confia em `X-Forwarded-For` arbitrário; na configuração padrão apenas o proxy loopback é confiável. Não use `*` indiscriminadamente. Sem IPs confiáveis, vários usuários podem compartilhar o limite de tentativas do proxy.

Os testes usam bases temporárias e contas de teste, não criam credenciais para o ambiente real:

```sh
python3 -m unittest server.test_api -v
python3 scripts/shared_browser_test.py
```

Os testes de API exigem `httpx` além das dependências de produção. O teste de navegador usa Python Playwright e `/usr/bin/chromium`. Não são dependências do site em produção. No ambiente cloud, sockets, Chromium e TestClient podem exigir a execução fora do sandbox restrito.

O teste de navegador inicia seu próprio servidor em 127.0.0.1:8001 e o encerra ao terminar. Verifica login, criação e bloqueio de contas, leitor sem edição, dados compartilhados entre contextos, conflitos, invalidação da sessão e saída. O teste de API verifica ainda cookies, hashing, último administrador, rotas privadas, validações, limites de tentativas e persistência após reinício.

Para a versão estática anterior, o comando `python3 -m http.server 8000 --bind 127.0.0.1` continua disponível. Nesse modo não há banco compartilhado ou permissões reais, e as edições ficam no navegador. Os dois modos não devem ser confundidos na divulgação do link.

Para a versão2, leia também [o guia de operação](BACKEND_OPERATIONS.md): inclui snapshots diários, recuperação administrativa, calendário congelado da linha-base, despesas em centavos e restauração exclusiva de administrador. O PIN curto foi preservado por preferência do produto; não é equivalente a MFA.
