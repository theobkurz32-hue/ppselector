# Dados cartográficos e de elevação

Aquisição inicial: **3 de novembro de 2026**. O jogo utiliza cópias locais; não consulta serviços cartográficos durante a viagem.

## Eixo da BR-293

* Fonte primária: [OpenStreetMap](https://www.openstreetmap.org/copyright), por colaboradores do OpenStreetMap, licença **ODbL 1.0**.
* Extração inicial: geometria do serviço público [OSRM](https://project-osrm.org/), calculada sobre dados OSM, com detalhes de passos da rota. A data de aquisição não é a data de atualização da base OSM usada pelo servidor OSRM.
* Recorte: passo identificado como **BR-293**, aproximadamente **51,3 km**, desde a saída da área de Pelotas, perto de longitude −52,434185 / latitude −31,756707, até o entroncamento do acesso **ERS-702**, perto de longitude −52,959948 / latitude −31,699132.
* Destino do jogo: **acesso rodoviário a Piratini**, não a sede urbana de Piratini. O recorte começa na BR-293; não pretende reproduzir um percurso urbano completo pelo centro de Pelotas.
* Processamento: seleção do passo BR-293, preservação da ordem do eixo, conversão para GeoJSON, amostragem/interpolação espacial, inclusão de altitude pelo DEM e conversão, no cliente, de WGS84 para um sistema cartesiano local em metros.
* Arquivos de distribuição: `public/maps/route.json` e `public/maps/route.geojson`. O cache de aquisição e o eixo intermediário ficam em `scripts/gis/cache/`. Os 224 nós do eixo OSRM são densificados para espaçamento máximo de 20 m, resultando em aproximadamente 2.700 amostras; densificação não acrescenta precisão ao traçado original.
* O traçado horizontal é derivado de cartografia real. Vegetação, cercas e outros objetos decorativos procedurais não constituem um levantamento cadastral.

## Entroncamento e acesso a Piratini

* Fonte: API pública do **OpenStreetMap**, recorte geográfico do entroncamento da BR-293 com a ERS-702, incluindo vias, alças e sentidos de circulação disponíveis no OSM na aquisição.
* Licença: ODbL 1.0; atribuição aos colaboradores do OpenStreetMap.
* Processamento: recorte e conversão das geometrias reais em segmentos renderizáveis. Os arquivos locais de acesso/interseção são mantidos em `public/maps/`.
* A presença de alças e sentidos no OSM não comprova equivalência ao projeto executivo mais recente. **A configuração atual da rotatória ainda requer conferência com documentação oficial atualizada e/ou levantamento em campo.** A versão não declara que o entroncamento foi certificado pelo DNIT.

## Relevo

* Fonte de distribuição: [AWS Open Data — Terrain Tiles](https://registry.opendata.aws/terrain-tiles/), bucket público `elevation-tiles-prod`, formato **Mapzen Terrarium**: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`.
* Fórmula de decodificação da altitude em metros: `R × 256 + G + B / 256 − 32768`.
* Trata-se de um mosaico público composto de fontes de elevação. **SRTM** é uma fonte candidata para esta região, mas a procedência de cada pixel não foi certificada individualmente; a versão não afirma uso de Copernicus DEM nem de uma fonte única para o recorte. A reamostragem dos tiles e do grid local pode produzir resolução efetiva inferior à resolução original.
* Referências de procedência e atribuição: [Mapzen Terrain Tiles](https://github.com/tilezen/joerd/blob/master/docs/attribution.md), [SRTM / NASA JPL](https://www.earthdata.nasa.gov/data/instruments/srtm). Os dados de origem possuem suas respectivas condições; SRTM é distribuído como dado público dos Estados Unidos. A hospedagem AWS não transfere automaticamente uma licença única a todas as fontes do mosaico.
* Processamento: download e cache de 36 tiles PNG no zoom 12 (aproximadamente 33 m por pixel nessa latitude), decodificação Terrarium, construção de grid regular WGS84 de 641 × 281 amostras, interpolação bilinear e amostragem da estrada. Recorte: longitude −53,04 a −52,35; latitude −31,84 a −31,60. O grid tem espaçamento aproximado de 100 m. O perfil viário recebe filtro triangular com raio aproximado de 80 m para reduzir ruído e degraus do raster; isso não equivale a cotas topográficas de engenharia.
* Arquivo de distribuição: `public/maps/terrain.json`, acompanhado das altitudes em `route.json`. O relevo da viagem deriva desse conjunto local, não de ruído procedural aleatório.

## DNIT, SNV e SIAET

Referências oficiais para validação futura:

* [DNIT — Sistema Nacional de Viação](https://www.gov.br/dnit/pt-br/assuntos/atlas-e-mapas/pnv-e-snv).
* [DNIT](https://www.gov.br/dnit/pt-br).
* [SIAET/DNIT](https://siaet.dnit.gov.br/).

**Limitação explícita:** esta versão não concluiu a validação da quilometragem oficial pelo SNV/SIAET, nem incorporou projeto executivo da rotatória. Distâncias do HUD são distâncias medidas ao longo da geometria local; não devem ser interpretadas como marcos quilométricos oficiais. Não há declaração de endosso por órgão público.

## Hidrografia, uso do solo e objetos

A integração completa de bases de hidrografia, pontes, bueiros e uso/cobertura do solo permanece pendente. Elementos visuais sem referência cartográfica específica são decoração ou aproximação procedural, não uma afirmação da existência do objeto naquela coordenada. Não se deve usar esta simulação para navegação, inspeção rodoviária ou decisões de engenharia.

## Reprodução e funcionamento sem rede

O pipeline fica em `scripts/gis/`; o README descreve os comandos disponíveis. As aquisições mantêm cache local para permitir repetição do processamento sem depender de disponibilidade permanente dos serviços. A execução normal do jogo lê apenas os arquivos de `public/maps/`. Falha na atualização não autoriza substituir o eixo real por uma estrada aleatória.

Ao redistribuir esta base ou uma base derivada de OSM, manter atribuição visível e observar as obrigações da ODbL, incluindo as condições aplicáveis à oferta da base derivada. O código do jogo e as geometrias procedurais próprias são materiais distintos dos dados cartográficos licenciados.

### Serviços alternativos utilizados

As tentativas iniciais de Overpass retornaram HTTP 406 ou timeout nesta sessão. Por isso o eixo incluído usa a geometria OSM derivada do OSRM, com resposta original preservada em `scripts/gis/cache/osrm-pelotas-piratini.json`. A API OSM forneceu separadamente a topologia local do acesso, preservada em `piratini-access.osm` e convertida em `access-topology.geojson`. Não houve substituição procedural do eixo horizontal.
