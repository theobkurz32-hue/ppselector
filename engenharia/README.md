# Théo Kurz · Engenharia Civil

Site de apresentação de assessoria em engenharia, laudos, vistorias e coordenação de projetos. Interface pensada primeiro para celular, com fundo preto, tipografia branca e superfícies em cinza escuro.

Endereço: https://theobkurz32-hue.github.io/ppselector/engenharia/

Este site está inteiramente na pasta `engenharia/` do repositório existente. As páginas e os arquivos do projeto original foram preservados. O GitHub Pages continua publicando a branch `main`, pasta raiz; alterações dentro de `engenharia/` atualizam o portfólio.

## Conteúdo e recursos

- Página responsiva em HTML, CSS e JavaScript, sem dependências de execução.
- Menu mobile com navegação por seções e controle por teclado.
- Portfólio na abertura, com três fotos reais, deslize horizontal, setas e visualização ampliada. As fotos mantêm a proporção original, sem cortes e sem reprodução automática.
- Soluções com escopo, formatos de entrega e acesso ao contato.
- Três PDFs demonstrativos para visualizar e baixar.
- Formulário que prepara uma mensagem no WhatsApp, sem armazenar os dados no site.
- Alternativa de contato por e-mail.

## Editar

- `index.html`: textos, seções, serviços e links dos exemplos.
- `styles.css`: cores, tipografia e organização em diferentes tamanhos de tela.
- `site.config.js`: WhatsApp em formato internacional, somente dígitos, e e-mail.
- `assets/portfolio/`: fotografias enviadas pelo proprietário, preservadas em JPEG sem alterações. A vista geral mais iluminada (`ambiente-02.jpg`) abre a galeria; as demais mostram outras perspectivas do mesmo ambiente.
- `assets/exemplos/`: PDFs demonstrativos. Substitua por entregas reais autorizadas quando disponíveis e atualize os textos de identificação no HTML.

O nome profissional também aparece nos metadados, na marca, nas miniaturas e no rodapé de `index.html`. Ao mudar a identidade, atualize esses trechos e o texto de saudação de `script.js`.

As legendas do portfólio descrevem apenas o que aparece nas fotos; o escopo de atuação nesse ambiente ainda pode ser detalhado pelo proprietário. Os serviços e formatos apresentados são uma organização inicial da oferta informada. Escopo, responsáveis técnicos e condições devem ser definidos por contratação. Não há preços, depoimentos ou credenciais inventados.

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
