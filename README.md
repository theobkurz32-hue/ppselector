# N14 Riviera · Orçamento, planejamento e acompanhamento

Painel responsivo em português, convertido da planilha `N14_Riviera_Orcamento_Gantt_Revisado.xlsx`. Possui orçamento por fase, insumos editáveis, linha-base física, cronograma Gantt/lista, despesas e pagamentos e premissas. O tema é monocromático e as fases começam recolhidas.

## Dois modos de uso

| Modo | Executar | Onde os dados ficam |
| --- | --- | --- |
| Local/estático, incluindo GitHub Pages | `python3 -m http.server 8000 --bind 127.0.0.1` | Somente no navegador e origem atuais. Faça backup JSON. |
| Compartilhado com login | `python3 -m server.run`, após configurar o ambiente | SQLite em disco persistente; permissões validadas no servidor. |

**GitHub Pages não executa a API.** Enviar o código ao GitHub não ativa banco ou login. O modo aparece em aviso persistente na interface. O servidor compartilhado exige HTTPS e armazenamento persistente. Não há sincronização com Google Sheets.

Veja [implantação no Render](docs/SHARED_HOSTING.md) e [operação, backup e recuperação](docs/BACKEND_OPERATIONS.md). A configuração `render.yaml` usa serviço pago e disco persistente; nenhum serviço pago é criado automaticamente. Usuário e PIN iniciais devem ser definidos nas configurações seguras do provedor. Não há conta de produção predefinida.

## Conferência da origem

- 19 fases, 183 serviços, 183 atividades, 383 insumos; área de 289,33 m².
- Custo direto original: **R$ 1.650.800,62**.
- Reserva original de 8%: **R$ 132.064,05**; total: **R$ 1.782.864,67**.
- Preços zero e serviços de confiança baixa não foram preenchidos com valores inventados. O dashboard sinaliza essas pendências. A confirmação de projetos, medições e cotações cabe ao responsável pela obra.
- Não há BDI/markup automático. O valor da reserva é separado do fluxo mensal de custos diretos.

## Como usar

**Orçamento → Serviços:** abra uma fase e um subitem para consultar sua composição. O botão de insumos permite editar quantidade e preço. Os parâmetros incluem área, reserva e feriados/paralisações, em datas `AAAA-MM-DD` separadas por vírgulas.

**Orçamento → Despesas e pagamentos:** registre descrição, serviço, valor, data, vencimento e pagamento. É possível editar ou excluir lançamentos. O painel separa pago, a pagar e vencido. O saldo apresentado é orçamento estimado menos lançamentos, não saldo bancário. Pagamentos futuros não são aceitos como realizados. Não há integração bancária, fiscal ou contábil.

**Linha-base física:** a migração preserva pesos e datas originais como referência provisória, com aprovação pendente. Uma aprovação explícita captura os custos atuais como pesos e as datas/calendário atuais como referência. Somente administrador pode aprovar no modo compartilhado; no modo local, o usuário do navegador pode fazê-lo.

**Plano:** datas, progresso e dependências fim→início podem ser editados por código. A rotina de replanejamento, mediante confirmação, desloca para frente atividades não iniciadas, preservando a duração útil. Ela não muda atividades parcialmente executadas ou concluídas. Ciclos e referências inexistentes são rejeitados. Conflitos de sequência são sinalizados. Folgas e cadeia crítica são calculadas para os vínculos cadastrados; a rede original não possuía dependências estruturadas, apenas observações. A análise exige validação do responsável técnico; não é um CPM executivo aprovado automaticamente.

**Leitor:** pode consultar inclusive os detalhes completos do Gantt em diálogo somente leitura. **Editor:** altera custos, calendário, progresso, datas, dependências e despesas. **Administrador:** também gerencia contas, aprova/redefine linha-base e restaura backup compartilhado.

## Regras de cálculo

As regras estão em `domain.js`, separadas da interface e cobertas por testes Node:

- Valor do insumo: quantidade × preço, com arredondamento decimal **half-up por insumo, em centavos**. Totais são somados em centavos; isso elimina diferenças entre a soma das linhas exibidas e o total do serviço. Preços unitários podem manter precisão de origem; o arredondamento ocorre no total de cada insumo. A distribuição entre naturezas pode variar centavos em relação às somas não arredondadas do Excel, preservando o total direto original.
- Reserva: arredondada em centavos sobre o custo direto. Total por área inclui a reserva.
- Físico previsto e executado: usam os mesmos pesos fixos da linha-base. Alterar preços não altera o progresso. A aprovação de uma nova linha-base muda explicitamente os pesos; ela não ocorre durante uma edição comum.
- Calendário da linha-base é um snapshot independente do calendário operacional; mudar um feriado operacional não reescreve silenciosamente a curva física aprovada.
- Financeiro previsto: custo direto atual distribuído nos dias úteis de cada atividade, com os centavos residuais distribuídos de forma determinística. A reserva não é distribuída nessa curva.
- Financeiro pago: pagamentos registrados por data efetiva, no mesmo denominador de custo direto. Valores acima de 100% são apresentados no detalhamento; a área gráfica tem escala limitada a 100%.
- Físico real é o progresso atual informado; não é estimado a partir de pagamentos. O site não inventa histórico diário de medições que não foi registrado.
- Atividades incompletas vencidas exibem atraso mesmo com progresso parcial. Os dias de atraso são corridos; a duração das atividades é útil.
- Calendário operacional: segunda a sexta menos feriados/paralisações informados. Um período sem dia útil é rejeitado. Dados legados desse tipo são preservados durante migração, sinalizados e precisam ser corrigidos antes de novas gravações.

## Migração e proteção dos dados

O schema atual é v2. Backups v1 e edições locais anteriores continuam sendo lidos. A referência para novos pesos é a origem, não os preços já modificados no navegador. Antes da primeira migração local, uma cópia v1 é preservada em `riviera-project-backup-v1`; cada gravação mantém também a versão local anterior em `riviera-project-last-good`. Exporte backups JSON para não depender somente do armazenamento do navegador.

O servidor migra o banco existente sem resetar contas ou alterações. Mudanças de versão incrementam a revisão. Conflitos de salvamento retornam 409, preservando o formulário para revisão. Atualizações em segundo plano respeitam rascunhos; descarte manual exige confirmação. Falha de rede ou armazenamento não é apresentada como sucesso.

O backup JSON inclui projeto, linha-base, calendário e despesas. Contas, hashes e auditoria exigem backup completo SQLite. Na configuração Render, snapshots consistentes são feitos no início e diariamente, com retenção de sete; uma cópia externa privada deve ser configurada na hospedagem para proteger contra perda do volume.

## Instalação e testes

O site estático não tem dependências de produção ou build. O backend requer Python 3.12 e:

```sh
pip install -r server/requirements.txt
```

As verificações são executadas pelo workflow `.github/workflows/quality.yml` em pushes e pull requests:

```sh
node --test tests/domain.test.js
python3 -m unittest discover -s server -p 'test_*.py' -v
```

Com o servidor estático ativo em 127.0.0.1:8000:

```sh
python3 scripts/smoke_test.py
python3 scripts/mobile_test.py
python3 scripts/upgrade_browser_test.py
```

Os testes compartilhados iniciam/encerram seu próprio servidor temporário ou usam mocks:

```sh
python3 scripts/shared_browser_test.py
python3 scripts/shared_drafts_test.py
```

Testes de navegador exigem Python Playwright e Chromium; os de API usam `httpx`. No CI, o Playwright instala Chromium. No ambiente cloud, operações de socket/Chromium podem exigir execução fora do sandbox restrito. Não são usados usuários reais ou dados de produção.

A interface foi verificada de 320 a 1440 px em Chromium, sem vazamento horizontal. Possui ícones PWA, navegação por teclado, ligação explícita de títulos de diálogos e alvos de toque ampliados. A validação em iPhone físico/Safari e VoiceOver ainda deve ser feita; esses testes não constituem certificação WCAG.

## Reimportar a origem

`data/N14_Riviera_Original.xlsx` é preservado. O comando abaixo, com `openpyxl`, substitui o JSON de referência; não deve ser usado para sobrescrever dados atuais de usuários:

```sh
python3 scripts/import_workbook.py
```

O Excel usa dados em cache na importação e não é reescrito pelas edições feitas no site.


## BR-293 · Estrada do Pampa

O repositório também hospeda o jogo 3D **Estrada do Pampa**, de forma independente do painel Riviera.

**[Jogar no navegador](https://theobkurz32-hue.github.io/ppselector/jogo/)** · [Código e instruções](estrada-do-pampa/README.md) · [Publicação e atualização](docs/GAME_HOSTING.md)

O jogo inclui a viagem de aproximadamente 51,3 km da BR-293 ao acesso ERS-702 de Piratini, dados OSM e relevo locais, caminhão, tráfego, clima e eventos. Não depende da API do painel. As limitações de simulação e validação cartográfica estão documentadas na pasta do jogo.
