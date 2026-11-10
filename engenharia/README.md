# Lítica Engenharia

Site de apresentação de assessoria em engenharia, laudos, vistorias e coordenação de projetos da Lítica Engenharia. Interface pensada primeiro para celular, com a identidade visual fornecida: grafite profundo `#1E1E1E`, bege pedra `#E6DED3` e bronze mineral `#A37C52`. O verde da referência não faz parte do tema.

Endereço: https://theobkurz32-hue.github.io/ppselector/engenharia/

Este site está inteiramente na pasta `engenharia/` do repositório existente. As páginas e os arquivos do projeto original foram preservados. O GitHub Pages continua publicando a branch `main`, pasta raiz; alterações dentro de `engenharia/` atualizam o portfólio.

## Conteúdo e recursos

- Página responsiva em HTML, CSS e JavaScript, sem dependências de execução.
- Menu mobile com navegação por seções e controle por teclado.
- Abertura visual com 13 fotos reais em um mosaico assimétrico, sem título visível nem carrossel. Imagens grandes, pequenas, verticais e horizontais compartilham a composição; todas aparecem na página, em duas colunas no celular e quatro em telas maiores.
- Cada foto abre uma visualização ampliada com o arquivo original completo, sem cortes. No mosaico, o enquadramento se adapta à proporção de cada bloco.
- Soluções com escopo, formatos de entrega e acesso ao contato.
- Três PDFs demonstrativos para visualizar e baixar.
- Formulário que prepara uma mensagem no WhatsApp, sem armazenar os dados no site.
- Alternativa de contato por e-mail.

## Editar

- `index.html`: textos, seções, serviços e links dos exemplos.
- `styles.css`: cores, tipografia e organização em diferentes tamanhos de tela.
- `site.config.js`: WhatsApp em formato internacional, somente dígitos, e e-mail.
- `assets/brand/`: logo horizontal e símbolo da Lítica Engenharia, baseados na referência fornecida. O símbolo também é usado como favicon.
- `assets/portfolio/`: fotografias enviadas pelo proprietário, preservadas em JPEG sem alterações. `espaco-01.jpg` a `espaco-10.jpg` apresentam diferentes ambientes; `ambiente-01.jpg` a `ambiente-03.jpg` são as primeiras imagens enviadas do espaço para apresentações.
- `assets/exemplos/`: PDFs demonstrativos. Substitua por entregas reais autorizadas quando disponíveis e atualize os textos de identificação no HTML.

A marca principal é Lítica Engenharia em todos os textos, metadados, miniaturas e mensagens de contato. Théo Kurz aparece no site somente como responsável técnico no rodapé. Os canais de contato informados foram mantidos.

As descrições acessíveis e as legendas na visualização ampliada descrevem apenas o que aparece nas fotos; o escopo de atuação nesses ambientes ainda pode ser detalhado pelo proprietário. Os serviços e formatos apresentados são uma organização inicial da oferta informada. Escopo, responsáveis técnicos e condições devem ser definidos por contratação. Não há preços, depoimentos ou credenciais inventados.

## Executar localmente

Este projeto é estático: abra `index.html` diretamente ou sirva a pasta com seu servidor HTTP local preferido. Não há instalação nem compilação.

## Hospedar no GitHub Pages

Em **Settings → Pages**, selecione **Deploy from a branch**, branch **main**, pasta **/ (root)**. O arquivo `.nojekyll` preserva a publicação estática. Todos os ativos usam caminhos relativos, compatíveis com o subdiretório do repositório no Pages.

## Gerar os modelos em PDF novamente

Os PDFs já estão incluídos. Para regenerá-los, execute `python3 scripts/generate_samples.py` em um ambiente com ReportLab e as fontes indicadas pelo script. Isso é opcional e não participa da publicação do site.

## Privacidade

O site não usa cookies, rastreadores, analytics, serviços de formulário nem banco de dados. Ao enviar o formulário, o visitante abre o WhatsApp com uma mensagem preenchida e confirma o envio por lá. O link de e-mail abre o aplicativo de e-mail do visitante. Esses serviços externos seguem suas próprias políticas.

## Validação

Verificações estáticas de HTML, âncoras, ativos, JavaScript e PDFs realizadas durante a criação. Layout implementado para telas de 320 px em diante, com melhoria progressiva para tablet e desktop. O teste visual em Safari/iOS real deve ser feito no endereço publicado.
