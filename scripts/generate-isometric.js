#!/usr/bin/env node

/*
  Gera uma Cidade Cyberpunk Isométrica baseada no GitHub Calendar.
  Tema: Neon Engineering (Roxo, Azul, Ciano) com Reflexo no Chão
*/

const { graphql } = require('@octokit/graphql');
const fs = require('fs');
const path = require('path');
const argv = require('minimist')(process.argv.slice(2));

// --- Funções Auxiliares (Permanece igual) ---
async function fetchContributions(user, year, token) {
  const from = `${year}-01-01T00:00:00Z`;
  const to = `${year}-12-31T23:59:59Z`;
  const client = graphql.defaults({
    headers: { authorization: `token ${token}` }
  });

  const query = `query ($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
    }
  }`;

  const res = await client(query, { login: user, from, to });
  return res.user.contributionsCollection.contributionCalendar.weeks;
}

function flattenDays(weeks) {
  const days = [];
  weeks.forEach((week, wi) => {
    week.contributionDays.forEach((d, di) => {
      days.push({ week: wi, dow: di, date: d.date, count: d.contributionCount });
    });
  });
  return days;
}

// --- Função Principal de Geração do SVG ---
function createSVG(days, opts) {
  // Ajuste para garantir que o grid caiba (aumentei um pouco as margens)
  const weeks = Math.max(...days.map(d => d.week)) + 2;
  const rows = 8;

  const tileW = opts.tileW || 42;
  const tileH = opts.tileH || 26;
  const maxCount = Math.max(...days.map(d => d.count), 1);

  const palette = [
    '#161b22', // 0: Vazio
    '#2e1065', // 1: Roxo escuro
    '#7c3aed', // 2: Roxo médio
    '#c026d3', // 3: Magenta
    '#22d3ee', // 4: Ciano elétrico
    '#ffffff'  // 5: Branco neon
  ];

  const width = (weeks + rows) * (tileW / 2) + 150;
  const height = (weeks + rows) * (tileH / 2) + 400;

  // Ajuste da origem para centralizar melhor
  const originX = 80 + rows * (tileW / 2);
  const originY = 150;

  function proj(x, y, z = 0) {
    const px = originX + (x - y) * (tileW / 2);
    const py = originY + (x + y) * (tileH / 2) - z;
    return { x: px.toFixed(1), y: py.toFixed(1) };
  }

  function colorForCount(c) {
    if (c === 0) return palette[0];
    const ratio = c / maxCount;
    if (ratio < 0.2) return palette[1];
    if (ratio < 0.4) return palette[2];
    if (ratio < 0.7) return palette[3];
    if (ratio < 0.9) return palette[4];
    return palette[5];
  }

  function shadeColor(hex, percent) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);

    r = Math.round(Math.min(255, Math.max(0, r * (100 + percent) / 100)));
    g = Math.round(Math.min(255, Math.max(0, g * (100 + percent) / 100)));
    b = Math.round(Math.min(255, Math.max(0, b * (100 + percent) / 100)));

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  let pieces = [];

  // --- Definições de Filtros (Adicionado floor-blur) ---
  const defs = `
  <defs>
    <filter id="neon-glow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feFlood flood-color="#22d3ee" flood-opacity="0.9"/>
      <feComposite in="SourceGraphic" in2="blur" operator="out"/>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="soft-glow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feFlood flood-color="#c026d3" flood-opacity="0.6"/>
      <feComposite in="SourceGraphic" in2="blur" operator="out"/>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="floor-blur" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="6" />
    </filter>

    <style>
      text { font-family: 'Segoe UI', Ubuntu, sans-serif; fill: #94a3b8; font-size: 16px; }
      .title-text { font-weight: bold; fill: #22d3ee; }
    </style>
    <linearGradient id="bg-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#090c14"/> <stop offset="100%" stop-color="#1a163f"/>
    </linearGradient>
  </defs>`;

  // Ordenação (Painter's Algorithm)
  days.sort((a, b) => (a.week + a.dow) - (b.week + b.dow));

  days.forEach(d => {
    const x = d.week;
    const y = d.dow;

    let zHeight = 0;
    if (d.count > 0) {
      // Altura um pouco mais dramática
      zHeight = 12 + Math.pow(d.count / maxCount, 1.1) * 200;
    }

    // Pontos da Base (Chão)
    const baseA = proj(x, y);     // Topo (fundo)
    const baseB = proj(x + 1, y); // Direita
    const baseC = proj(x + 1, y + 1); // Baixo (frente)
    const baseD = proj(x, y + 1); // Esquerda

    // Pontos do Topo (Altura Z)
    const topA = proj(x, y, zHeight);
    const topB = proj(x + 1, y, zHeight);
    const topC = proj(x + 1, y + 1, zHeight);
    const topD = proj(x, y + 1, zHeight);

    const color = colorForCount(d.count);
    // Sombreamento mais forte para contraste
    const leftColor = shadeColor(color, -35);
    const rightColor = shadeColor(color, -15);

    const glowFilter = d.count / maxCount > 0.6 ? 'url(#neon-glow)' :
      d.count / maxCount > 0.3 ? 'url(#soft-glow)' : 'none';

    if (d.count > 0) {
      // --- NOVO: REFLEXO NO CHÃO (Ground Glow) ---
      // Determina a cor do reflexo (ciano para altos, magenta para médios)
      const reflectionColor = d.count / maxCount > 0.4 ? '#22d3ee' : '#c026d3';
      // Desenha a base com desfoque e transparência ANTES das paredes
      pieces.push(`<polygon points="${baseA.x},${baseA.y} ${baseB.x},${baseB.y} ${baseC.x},${baseC.y} ${baseD.x},${baseD.y}" 
        fill="${reflectionColor}" opacity="0.3" filter="url(#floor-blur)"/>`);

      // PAREDE ESQUERDA (FRENTE)
      pieces.push(`<polygon points="${baseD.x},${baseD.y} ${baseC.x},${baseC.y} ${topC.x},${topC.y} ${topD.x},${topD.y}" fill="${leftColor}"/>`);

      // PAREDE DIREITA (FRENTE)
      pieces.push(`<polygon points="${baseB.x},${baseB.y} ${baseC.x},${baseC.y} ${topC.x},${topC.y} ${topB.x},${topB.y}" fill="${rightColor}"/>`);

      // TOPO (Teto)
      pieces.push(`<polygon points="${topA.x},${topA.y} ${topB.x},${topB.y} ${topC.x},${topC.y} ${topD.x},${topD.y}" 
                    fill="${color}" stroke="${shadeColor(color, 30)}" stroke-width="0.7" 
                    filter="${glowFilter}"/>`);

      // Detalhes: Janelas/LEDs laterais para prédios mais altos
      if (zHeight > 60) {
        const dots = Math.floor(zHeight / 35);
        for (let i = 1; i <= dots; i++) {
          const h = zHeight - (i * 28);
          // Pequeno ajuste na posição dos LEDs para ficarem mais centralizados nas faces
          const pLeft = proj(x + 0.1, y + 0.8, h);
          const pRight = proj(x + 0.8, y + 0.1, h);
          pieces.push(`<circle cx="${pLeft.x}" cy="${pLeft.y}" r="1.8" fill="#22d3ee" opacity="0.9"/>`);
          pieces.push(`<circle cx="${pRight.x}" cy="${pRight.y}" r="1.8" fill="#22d3ee" opacity="0.9"/>`);
        }
      }
    } else {
      // Chão vazio (Grid mais sutil)
      pieces.push(`<polygon points="${baseA.x},${baseA.y} ${baseB.x},${baseB.y} ${baseC.x},${baseC.y} ${baseD.x},${baseD.y}" 
                    fill="none" stroke="#2e364f" stroke-width="0.4" opacity="0.5"/>`);
    }
  });

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
  ${defs}
  <rect width="100%" height="100%" fill="url(#bg-gradient)"/>

  <g transform="translate(0, 20)"> ${pieces.join('\n    ')}
  </g>

  <text x="60" y="${height - 60}" class="title-text">CONTRIBUTION CITY • 2025</text>
  <text x="${width - 60}" y="${height - 60}" text-anchor="end" fill="#7c3aed" font-weight="bold" style="letter-spacing: 1px;">ENGINEERING MODE v2</text>
</svg>`;

  return svg;
}

// --- Função Principal de Execução ---
async function main() {
  try {
    // Tenta pegar do argumento --token, senão do ambiente
    const token = argv.token || process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GITHUB_TOKEN is required (use --token or env var)');

    const user = argv.user || process.env.GITHUB_ACTOR;
    if (!user) throw new Error('GitHub User is required (use --user or env var)');

    const year = argv.year || new Date().getFullYear();
    const out = argv.out || 'contrib-city-neon.svg';

    console.log(`Buscando contribuições para: ${user} (${year})...`);
    const weeks = await fetchContributions(user, year, token);
    const days = flattenDays(weeks);

    console.log('Gerando cidade isométrica...');
    const outDir = path.dirname(out);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const svg = createSVG(days, {});
    fs.writeFileSync(out, svg, 'utf8');

    console.log(`Cidade cyberpunk gerada com sucesso: ${out}`);
  } catch (err) {
    console.error('Erro:', err.message || err);
    process.exit(1);
  }
}

if (require.main === module) main();