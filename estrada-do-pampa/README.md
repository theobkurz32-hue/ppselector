# BR-293 · Estrada do Pampa

Jogo de condução 3D para navegador, em português, com caminhão articulado e viagem de Pelotas ao entroncamento de acesso a Piratini, no Rio Grande do Sul. Esta é a **versão jogável 0.2**: um ponto de partida funcional para evoluir a simulação e a fidelidade regional.

A viagem usa escala física de **1 unidade = 1 metro**, com geometria rodoviária e elevação previamente processadas. Não há compressão de distância no modo atual. O destino é o **acesso rodoviário**, não o centro de Piratini. Consulte [DATA_SOURCES.md](DATA_SOURCES.md) para procedência, datas, processamento e limites da validação cartográfica.

## Executar

Requisitos: Node.js 20.19+ ou 22.12+ e npm; navegador atualizado com WebGL2 e aceleração gráfica. Chrome/Chromium, Edge e Firefox são os alvos iniciais. O navegador precisa permitir áudio após o clique de início.

```bash
npm install
npm run dev
```

Abra **http://localhost:5173** e clique em **Iniciar viagem**. `npm run dev` escuta também na rede local; em um ambiente remoto, encaminhe a porta 5173 para o seu navegador. Não abra `index.html` diretamente pelo sistema de arquivos.

```bash
npm run build
npm run preview
```

O build é gerado em `dist/`. O preview do Vite normalmente usa **http://localhost:4173**. A aplicação é estática: pode ser servida por qualquer servidor HTTP que disponibilize os arquivos de `dist/`.

Os dados locais em `public/maps/` fazem parte do projeto. **Não é necessário baixar novamente o mapa para jogar**, e a simulação não consulta APIs geográficas durante a viagem. A instalação de dependências requer acesso à rede; após o build, os recursos do jogo são servidos localmente.

## Primeira viagem

1. Escolha **Iniciar viagem** para começar ou **Continuar viagem salva** para recuperar o progresso deste navegador.
2. Mantenha `W` pressionado. O conjunto é pesado: a aceleração é gradual e as marchas são automáticas.
3. Use `A`/`D` com pequenas correções e mantenha a faixa da direita. Antecipe frenagens, curvas, animais e obras.
4. `C` alterna entre cabine, câmera traseira, externa e para-choque. `M` abre o mapa.
5. Siga a BR-293 até o entroncamento de acesso a Piratini para concluir a viagem. O percurso não é abreviado; use as ferramentas de desenvolvimento para verificar rapidamente pontos distantes.

Há tráfego nos dois sentidos, animais que se aproximam pelo acostamento e obras sinalizadas com bloqueio parcial. As ocorrências são elementos de gameplay; não representam incidentes reais ou condições atuais da rodovia.

## Controles

| Tecla | Ação |
| --- | --- |
| `W` / `↑` | Acelerar |
| `S` / `↓` | Freio de serviço |
| `A` / `D` ou `←` / `→` | Direção progressiva |
| `Espaço` | Freio de emergência |
| `B` | Freio motor enquanto pressionado |
| `C` | Alternar câmera |
| `V` | Câmera de cabine |
| `R` | Alternar frente / ré; freia antes de engatar |
| `U` | Ligar / desligar som |
| `J` | Rádio instrumental |
| `H` | Buzina enquanto pressionado |
| `L` | Alternar faróis |
| `Q` / `E` | Alternar seta esquerda / direita |
| `P` / `Esc` | Pausar / continuar |
| `M` | Abrir / fechar mapa |
| `F3` | Abrir / fechar telemetria e ferramentas |

Gamepad: analógico esquerdo para direção, gatilho direito para acelerar e esquerdo para frear. O mapeamento depende da API padrão do navegador. No celular, jogue na horizontal: direção à esquerda, pedais e seletor de ré à direita. Os botões Cabine, Câmeras, Som, Rádio e Tela ficam no canto superior direito. O modo vertical solicita girar o aparelho; tela cheia e bloqueio de orientação são tentados somente após um gesto e dependem do navegador. Suporte específico a volantes ainda não foi implementado.

## Testes e diagnóstico

```bash
npm test
npm run build
```

Os testes verificam comportamento longitudinal do caminhão e regras de tráfego. A compilação verifica TypeScript em modo estrito e gera o bundle. Os testes GIS, quando presentes em `tests/`, verificam os dados locais e a continuidade do percurso. Testes automatizados não substituem a condução e a inspeção visual no navegador.

`F3` mostra FPS, posição local, latitude/longitude, altitude, inclinação, velocidade, aceleração, RPM, marcha, forças longitudinais, aderência, chunks e veículos. O painel permite:

- ir ao início, meio da rota ou proximidade do acesso a Piratini;
- selecionar céu aberto, parcialmente nublado, encoberto, chuva leve, chuva intensa ou neblina;
- alterar o horário para verificar iluminação diurna e noturna.

As transições de clima são graduais; aguarde alguns segundos para observar umidade, neblina e chuva. O teleporte reposiciona o caminhão parado e reorganiza o tráfego próximo. É uma ferramenta de teste, não um modo de viagem comprimida.

`scripts/browser-check.mjs` contém uma verificação de navegador com Playwright: início, aceleração, frenagem, troca de câmera, clima/noite e conclusão. Exige servidor em `localhost:5173`, pasta `artifacts/` e Chromium disponível no caminho indicado pelo script. O fluxo de conclusão usa o acesso de desenvolvimento para evitar aguardar toda a viagem. Não equivale a um teste manual contínuo de toda a rodovia.

Com o servidor já em execução e o Chromium instalado, execute em outro terminal:

```bash
mkdir -p artifacts
node scripts/browser-check.mjs
```

## Arquitetura

| Módulo | Responsabilidade |
| --- | --- |
| `src/main.ts` | Carregamento dos dados locais e inicialização |
| `src/game/Game.ts` | Loop, integração, condução lateral, colisões, pontuação e salvamento |
| `src/core/Input.ts` | Teclado, gamepad e controles na tela |
| `src/vehicle/vehicleConfig.ts` | Parâmetros físicos centralizados |
| `src/vehicle/TruckPhysics.ts` | Motor, transmissão, forças, frenagem, combustível e dano |
| `src/vehicle/TruckModel.ts` | Modelo procedural, cabine, rodas, carreta, faróis e limpadores |
| `src/road/Route.ts` | Projeção geográfica, amostragem da rota, inclinação e terreno |
| `src/world/World.ts` | Chunks de estrada/terreno, vegetação e elementos rurais |
| `src/traffic/` | Veículos, seguimento, frenagem, ultrapassagens e reutilização de meshes |
| `src/animals/Animals.ts` | Bovinos e estados de aproximação, travessia e fuga |
| `src/events/RoadEvents.ts` | Obras e bloqueios parciais sinalizados |
| `src/weather/Atmosphere.ts` | Ciclo solar, céu, nuvens, chuva, neblina e iluminação |
| `src/audio/AudioEngine.ts` | Síntese de motor, vento/chuva, buzina e impactos |
| `src/game/Cameras.ts` | Quatro modos de câmera |
| `src/ui/` | Menu, HUD, mapa, pausa, configurações e diagnóstico |
| `src/data/worldConfig.ts` | Configurações do mundo e perfis gráficos |
| `scripts/gis/` | Aquisição e processamento reproduzível do mapa |
| `public/maps/` | Dados geográficos processados, servidos sem API externa |
| `tests/` | Testes de física, tráfego e dados geográficos |

A renderização usa **Three.js e WebGL2**, materiais PBR, tone mapping ACES e sombras dinâmicas locais. O motor não exige conta ou serviço de terceiros para iniciar uma viagem.

## Física

O caminhão genérico tem massa inicial de 38 toneladas, curva de torque com pico de 2.450 Nm, caixa automatizada de 12 marchas, diferencial e raio de pneu configuráveis. A força motriz usa torque × relação da marcha × diferencial × eficiência / raio da roda.

A integração longitudinal considera separadamente:

```text
F_aero = 0,5 × densidade_ar × Cd × área_frontal × velocidade²
F_rolamento = Crr × massa × gravidade × cos(inclinação)
F_rampa = massa × gravidade × sin(inclinação)
aceleração = força_resultante / massa
```

A inclinação vem do perfil geográfico da estrada. A massa, as resistências, a curva de torque, a troca de marcha e a aderência influenciam a resposta. Existem freio de serviço, emergência e motor, temperatura de freio, consumo e dano básico com severidade proporcional ao quadrado da velocidade relativa de impacto. Asfalto molhado reduz a aderência. Parâmetros ficam em `src/vehicle/vehicleConfig.ts`; `grade` é uma razão subida/distância horizontal, não graus.

A direção usa um modelo lateral simplificado de bicicleta, com suavização de teclado e limitação dependente da velocidade e aderência. A carreta acompanha um pivô cinemático com atraso de orientação. O balanço visual da cabine é amortecido. **Não há neste build suspensão raycast, contatos de pneus por eixo nem articulação multibody resolvida por Rapier**; a inclinação visual não deve ser confundida com uma simulação completa de suspensão.

## GIS, terreno e precisão

O pipeline separa aquisição cartográfica da execução do jogo: dados OSM/GIS → arquivos locais → coordenadas métricas → amostragem de eixo e altitude → malhas de estrada e terreno. Detalhes e comandos de atualização são documentados em [DATA_SOURCES.md](DATA_SOURCES.md).

O sistema local converte longitude em X e latitude em Z negativo, usando a latitude inicial como referência métrica. É uma aproximação regional equiretangular, não uma implementação UTM de precisão cadastral. A câmera e os grupos do mundo acompanham uma origem móvel em passos de 256 m para reduzir perda de precisão de renderização ao longo da viagem.

O perfil de altitude influencia as forças do caminhão. O terreno usa interpolação dos dados de elevação locais e uma faixa de concordância com a estrada para evitar descontinuidades de malha. Se o DEM não estiver disponível, o código dispõe de fallback explícito baseado apenas no perfil da estrada; isso não substitui um modelo digital completo. A ausência do eixo rodoviário impede o início e mostra uma mensagem: o jogo não cria silenciosamente uma estrada aleatória.

A vegetação, as cercas, os postes e as pequenas propriedades são preenchimento procedural inspirado na região. A posição desses elementos **não é um levantamento georreferenciado de cada árvore ou propriedade**. A atribuição cartográfica do OpenStreetMap aparece no jogo; fontes e licenças estão em `DATA_SOURCES.md` e [ATTRIBUTIONS.md](ATTRIBUTIONS.md).

## Desempenho e qualidade

Configurações oferecem **Baixa, Média, Alta e Ultra**. Alteram resolução interna, sombras e quantidade/distância dos chunks. Estrada e terreno são carregados próximos ao jogador; geometria distante usa menos detalhe. A vegetação usa instancing e o tráfego reutiliza um conjunto fixo de modelos. Chunks distantes liberam recursos de GPU.

A meta é fluidez em computadores intermediários. **Não há garantia de 60 FPS em todos os equipamentos**, e medições em renderização por software ou headless não representam uma GPU de consumidor. Em hardware limitado, selecione qualidade Baixa e reduza a resolução da janela. O diagnóstico `F3` ajuda a observar o comportamento no seu equipamento.

## Salvamento

O progresso é salvo periodicamente e ao pausar/sair, usando `localStorage`. Inclui posição na rota, distância, combustível, dano, horário e pontuação. A qualidade gráfica também é persistida. O salvamento pertence ao navegador e à origem HTTP usados; limpar dados do site remove esse progresso. Não existe conta, servidor de salvamentos ou sincronização entre dispositivos.

## Limitações da versão 0.2

- É uma implementação inicial jogável, não uma reprodução fotorealista ou um simulador homologado. Não use a representação como navegação rodoviária ou informação sobre condições atuais de tráfego.
- O renderer usa WebGL2. WebGPU e Rapier não estão integrados.
- Colisões usam impulso longitudinal por massa e aproximações ao longo da rota. Há desvio, giro e danos visuais simplificados, vidros trincados, fragmentos e tremor de câmera. Não há solver completo de corpos rígidos, soft-body ou capotamento avançado.
- Articulação da carreta e balanço/suspensão são aproximações cinemáticas e visuais. Jackknife dinâmico completo e física lateral detalhada por pneu ficam para uma evolução.
- Caminhão, veículos, animais, vegetação, texturas e construções usam geometria procedural. Não há fotogrametria regional ou biblioteca externa de modelos GLTF.
- A estrada segue o eixo adquirido; larguras, acostamentos, marcações e elementos de sinalização são generalizados. A representação detalhada do acesso/rotatória depende do que foi adquirido e validado, conforme `DATA_SOURCES.md`.
- Não há ainda rede secundária real roteável nem desvio temporário dirigível separado. As obras atuais têm bloqueio parcial e exigem passagem com atenção ao sentido oposto.
- Hidrografia, pontes, uso do solo e edificações ainda não constituem uma reprodução completa dos datasets disponíveis.
- Tráfego usa comportamentos de seguimento e ultrapassagem simplificados, sem toda a complexidade de condutores humanos ou regras de cada interseção.
- Eventos de obras e bovinos têm espaçamento controlado e são exemplos de gameplay. Não existe ainda uma biblioteca completa de acidentes, Pare e Siga, espécies animais e ocorrências contextuais.
- Sombras acompanham a luz solar numa área próxima; não há cascaded shadow maps. Neblina é aproximada por fog exponencial; nuvens e chuva não são simulações volumétricas físicas.
- A posição solar usa latitude/longitude e uma declinação de primavera aproximada, sem calendário astronômico completo. O ciclo é acelerado, com duração configurável.
- O áudio é sintetizado em camadas pela Web Audio API, com diesel, turbo, pneus, vento, chuva, aves/insetos e tráfego estéreo com Doppler aproximado. O rádio toca uma composição instrumental original e opcional, sem stream externo. Não são gravações de campo nem espacialização física completa. Som requer volume do aparelho e uma interação inicial com a página.
- Retrovisores são representações simplificadas; não há renderização independente de cena em cada espelho. Os controles e câmeras priorizam jogabilidade em navegador.
- A marcha à ré é limitada a aproximadamente 14 km/h e só engata depois de frear. Múltiplos caminhões selecionáveis, Quick Drive, remapeamento completo e suporte dedicado a volante ficam para versões futuras.

Para ampliar a rota, substitua ou acrescente datasets processados preservando o contrato de `Route`. Para calibrar o conjunto, altere `vehicleConfig.ts` e execute os testes antes de validar a resposta no navegador.

## Reprocessar os dados locais

Requer Python 3.10+ e `curl`; não exige bibliotecas Python adicionais.

```bash
npm run gis
```

Com os caches incluídos, esse comando funciona sem rede: lê o eixo OSM, decodifica os 36 tiles Terrarium, gera `route.geojson`, `access-topology.geojson`, `terrain.json` e o perfil `route.json`. O recorte tem aproximadamente **51,3 km**, 2.679 amostras no eixo e grid de terreno de 641 × 281 células. O eixo começa no entroncamento BR-116/BR-293 e termina no acesso ERS-702.

Para solicitar atualização dos dados OSM (o cache anterior é preservado se o serviço falhar):

```bash
python3 scripts/gis/acquire.py --refresh
```

Tiles DEM existentes são reutilizados. Para atualizar o raster, remova apenas os PNGs correspondentes em `scripts/gis/cache/dem/` e execute novamente com acesso à rede. O processador mantém o perfil distribuído até concluir a geração de novos arquivos. A versão não certifica quilometragem SNV nem equivalência da interseção ao projeto executivo atual.

O acesso tem suas vias e alças renderizadas a partir da topologia local OSM em `src/world/Access.ts`. Essa representação continua sujeita à limitação de validação oficial descrita em `DATA_SOURCES.md`.


## Mudanças da versão 0.2

Interface de celular na horizontal com múltiplos toques, seletor de ré, cabine por botão e controles de som/rádio. Corrigidos buffers de normais e buracos de streaming que podiam deixar o terreno branco em GPUs móveis; terreno e grama usam verde do Pampa. Colisões têm impulso, dano visual, fragmentos e tremor. Veículos têm carrocerias arredondadas e rodas animadas. Bovinos têm patas articuladas, apoio aproximado dos cascos e passada ligada à distância. Os 35 testes cobrem física, ré, tráfego, impactos, dano, GIS e todos os níveis gráficos do terreno.

Para repetir a validação de celular por emulação Chromium, com o jogo em execução:

```bash
GAME_URL=http://localhost:5173/ node scripts/mobile-check.mjs
```

O teste verifica múltiplos toques, ré/freio, botão de cabine, áudio ativo, rádio, impacto e dano visual, buffers de terreno, passada dos animais e aviso de orientação. Ele gera um relatório e capturas em `artifacts/mobile/`. A emulação não substitui testes em aparelhos físicos de diferentes GPUs.
