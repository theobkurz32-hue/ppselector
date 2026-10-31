# N14 Riviera · Gestão da obra

Site estático em português convertido de `N14_Riviera_Orcamento_Gantt_Revisado.xlsx`. Inclui visão geral, orçamento, planejamento Gantt/lista, quantitativos e premissas. A calculadora anterior continua em `cabos.html`.

## Executar

Na pasta do repositório:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Acesse a porta 8000 em seu ambiente local. Não abra o HTML diretamente pelo protocolo `file:`: os dados são carregados por HTTP. Não há dependências de produção, build, banco ou credenciais.

Para disponibilizar na internet, publique esta pasta em uma hospedagem estática com HTTPS (por exemplo, GitHub Pages). O site ainda não foi publicado por este projeto. A planilha e todos os dados incluídos ficarão acessíveis a quem tiver acesso à hospedagem; para acesso restrito, use uma hospedagem com autenticação. O service worker funciona em HTTPS ou loopback.

## Dados e comportamento

- Linha-base: 19 fases, 183 serviços, 383 insumos e 183 atividades; 289,33 m² e reserva de 8%.
- Custo direto original: R$ 1.650.800,62; total com reserva: R$ 1.782.864,67.
- Edite quantidade e preço em **Quantitativos**. Os custos por serviço, natureza, fase, total e área são recalculados a partir desses insumos. A quantidade de referência do serviço é preservada; não multiplica novamente os quantitativos detalhados.
- Área e reserva são editáveis em **Orçamento**.
- Datas, progresso e predecessora de referência são editáveis em **Planejamento**. Datas não reagendam automaticamente outras atividades. Duração calculada de segunda a sexta, sem feriados.
- A curva financeira e o desembolso mensal distribuem cada custo diretamente nos dias úteis da atividade; a curva física usa a média do avanço previsto dos pacotes. São recalculados no site, não imagens dos gráficos do Excel. Pode haver diferenças em relação aos valores em cache da planilha. Nenhuma despesa realizada é presumida.
- Avanço real ponderado pelo custo dos serviços; status segue a lógica do arquivo: concluído, em andamento, atrasado ou não iniciado. Data atual no fuso de São Paulo.
- Alterações são armazenadas em `localStorage` neste navegador e origem. Não há sincronização com Google Sheets ou entre usuários. Use **Backup** e **Restaurar** para guardar e transferir alterações; a restauração valida o arquivo e pede confirmação antes de substituir os dados.
- CSV exporta a tabela filtrada da seção atual (na visão geral e premissas, exporta orçamento). O Excel original permanece disponível em **Planilha original** e não é reescrito pelas edições do site.
- Os arquivos essenciais ficam em cache para funcionamento offline após o primeiro acesso. O download do Excel original exige conexão. Dados sensíveis não são enviados a serviços externos.
- A aba Contratos original estava vazia. As ressalvas e fontes da planilha foram preservadas em **Premissas e fontes**.

## Verificação

O ambiente de desenvolvimento possui Python Playwright e `/usr/bin/chromium`. Com o servidor em execução:

```sh
python3 scripts/smoke_test.py
```

O teste usa um navegador isolado e valida totais contra a planilha, edição, persistência, recálculo, reserva, filtros, progresso, datas inválidas, CSV, backup/restauração, premissas, offline e largura de tela móvel. Não altera os dados do navegador do usuário. Requer Playwright Python e Chromium; não são dependências do site.

A planilha original está em `data/N14_Riviera_Original.xlsx`. Para regenerar a linha-base a partir dela (substitui `data/project.json`):

```sh
python3 scripts/import_workbook.py
```

A importação exige `openpyxl`. As fórmulas do modelo são implementadas em `app.js`; o script usa os valores em cache do Excel para importar metadados e comparar a linha-base. Não modifica o Excel original.
