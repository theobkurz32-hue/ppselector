# Jogo BR-293 no GitHub Pages

URL pública: https://theobkurz32-hue.github.io/ppselector/jogo/

- `estrada-do-pampa/`: código TypeScript, testes, dados GIS, caches de processamento e documentação do jogo.
- `jogo/`: versão estática compilada, pronta para servir pelo GitHub Pages já configurado em `main`, pasta raiz.
- O painel Riviera permanece na raiz do site e não é substituído.

O jogo usa caminhos relativos: scripts, texturas procedurais e mapas funcionam sob `/ppselector/jogo/`. Todo o processamento GIS já foi feito; não há chamada a APIs cartográficas durante a viagem.

## Desenvolver

```bash
cd estrada-do-pampa
npm ci
npm run dev
```

## Atualizar a versão publicada

A partir da raiz do repositório:

```bash
cd estrada-do-pampa
npm ci
npm test
npm run build
cd ..
python3 scripts/stage_game.py
git add estrada-do-pampa jogo
git commit -m "Update Estrada do Pampa"
git push origin main
```

O Pages publica os arquivos de `jogo/` após o push. O workflow do jogo verifica testes e confirma que os arquivos compilados correspondem ao código enviado. O workflow `pages-build-deployment` publica o site existente e o jogo juntos.

Se a opção Pages for alterada futuramente, manter `main` e `/ (root)` como origem ou implantar um artefato que preserve os dois sites. GitHub Pages serve conteúdo estático, suficiente para este jogo WebGL2; não executa a API Python do painel Riviera.

Os dados de progresso do jogo ficam no navegador. `F3` permite testar clima, horário e teleporte. As limitações de validação oficial SNV/DNIT estão em `estrada-do-pampa/DATA_SOURCES.md`.
