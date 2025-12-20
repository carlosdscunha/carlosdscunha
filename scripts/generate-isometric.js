#!/usr/bin/env node
/*
  Gera uma Cidade Cyberpunk Isométrica baseada no GitHub Calendar.
  Tema: Neon Engineering (Roxo, Azul, Ciano)
*/



const { graphql } = require('@octokit/graphql');
const fs = require('fs');
const path = require('path');
const argv = require('minimist')(process.argv.slice(2));

async function fetchContributions(user, year, token) {
  const from = `${year}-01-01T00:00:00Z`;
  const to = `${year}-12-31T23:59:59Z`;
  const client = graphql.defaults({ headers: { authorization: `token ${token}` } });
  const query = `query ($login: String!, $from: DateTime!, $to: DateTime!) {
                        user(login: $login) {
                          contributionsCollection(from: $from, to: $to) {
                            contributionCalendar {
                              totalContributions
                                weeks {
                                  contributionDays {
                                    date
                                    contributionCount
                                  }
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



function createSVG(days, opts) {
  const weeks = Math.max(...days.map(d => d.week)) + 1;
  const rows = 7;

  const tileW = opts.tileW || 42;
  const tileH = opts.tileH || 26;
  const maxCount = Math.max(...days.map(d => d.count)) || 1;

  const palette = [
    '#161b22', // 0: Vazio
    '#2e1065', // 1: Roxo escuro
    '#7c3aed', // 2: Roxo médio
    '#c026d3', // 3: Magenta
    '#22d3ee', // 4: Ciano elétrico
    '#ffffff' // 5: Branco neon
  ];

  const width = (weeks + rows) * (tileW / 2) + 100;
  const height = (weeks + rows) * (tileH / 2) + 350;

  const originX = 50 + rows * (tileW / 2);
  const originY = 80;

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
    let R = parseInt(hex.substring(1, 3), 16);
    let G = parseInt(hex.substring(3, 5), 16);
    let B = parseInt(hex.substring(5, 7), 16);

    R = parseInt(R * (100 + percent) / 100);
    G = parseInt(G * (100 + percent) / 100);
    B = parseInt(B * (100 + percent) / 100);

    R = R < 255 ? R : 255;
    G = G < 255 ? G : 255;
    B = B < 255 ? B : 255;

    return "#" + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1).toUpperCase();
  }

  let pieces = [];

  // Definições de filtros para glow neon
  const defs = `
  <defs>
    <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feFlood flood-color="#22d3ee" flood-opacity="0.8"/>
      <feComposite in2="blur" operator="in"/>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feFlood flood-color="#c026d3" flood-opacity="0.5"/>
      <feComposite in2="blur" operator="in"/>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <style>text { font-family: 'Segoe UI', Ubuntu, sans-serif; fill: #94a3b8; font-size: 14px; }</style>
    <linearGradient id="bg-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#0f172a;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1e1b4b;stop-opacity:1" />
    </linearGradient>
  </defs>`;

  days.forEach(d => {
    const x = d.week;
    const y = d.dow;

    let zHeight = 0;
    if (d.count > 0) {
      zHeight = 8 + Math.pow((d.count / maxCount), 1.3) * 160; // Um pouco mais alto e dramático
    }

    const baseA = proj(x, y, 0);
    const baseB = proj(x + 1, y, 0);
    const baseC = proj(x + 1, y + 1, 0);
    const baseD = proj(x, y + 1, 0);

    const topA = proj(x, y, zHeight);
    const topB = proj(x + 1, y, zHeight);
    const topC = proj(x + 1, y + 1, zHeight);
    const topD = proj(x, y + 1, zHeight);

    const color = colorForCount(d.count);
    const leftColor = shadeColor(color, -40);   // Lado esquerdo mais escuro
    const rightColor = shadeColor(color, -20);  // Lado direito intermediário
    const topGlow = d.count / maxCount > 0.6 ? 'filter: url(#neon-glow);' : (d.count / maxCount > 0.3 ? 'filter: url(#soft-glow);' : '');

    if (d.count > 0) {
      // Lado esquerdo (agora visível e correto)
      pieces.push(`<polygon points="${baseD.x},${baseD.y} ${baseA.x},${baseA.y} ${topA.x},${topA.y} ${topD.x},${topD.y}" fill="${leftColor}" stroke="none"/>`);

      // Lado direito/inferior
      pieces.push(`<polygon points="${baseB.x},${baseB.y} ${baseC.x},${baseC.y} ${topC.x},${topC.y} ${topB.x},${topB.y}" fill="${rightColor}" stroke="none"/>`);

      // Topo com brilho neon
      let topStyle = `fill="${color}" stroke="${shadeColor(color, 30)}" stroke-width="1"`;
      if (topGlow) topStyle += ` style="${topGlow}"`;

      pieces.push(`<polygon points="${topA.x},${topA.y} ${topB.x},${topB.y} ${topC.x},${topC.y} ${topD.x},${topD.y}" ${topStyle}/>`);

      // Efeito LED vertical nas laterais (apenas em prédios médios/altos)
      if (d.count / maxCount > 0.4) {
        const ledSteps = Math.floor(zHeight / 20);
        for (let i = 1; i < ledSteps; i++) {
          const ledY = zHeight - i * 20;
          const ledTop = proj(x + 0.5, y + 0.5, ledY);
          pieces.push(`<circle cx="${ledTop.x}" cy="${ledTop.y}" r="1.5" fill="#22d3ee" opacity="0.8"/>`);
        }
      }
    } else {
      // Grid sutil no chão
      pieces.push(`<polygon points="${baseA.x},${baseA.y} ${baseB.x},${baseB.y} ${baseC.x},${baseC.y} ${baseD.x},${baseD.y}" fill="none" stroke="#232a3b" stroke-width="0.6" opacity="0.7"/>`);
    }
  });

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
  ${defs}
  <rect width="100%" height="100%" fill="url(#bg-gradient)" />

  <g transform="translate(0,20)">
    ${pieces.join('\n    ')}
  </g>

  <text x="40" y="${height - 40}">Contribution City • 2025</text>
  <text x="${width - 40}" y="${height - 40}" text-anchor="end" fill="#7c3aed" font-weight="600">Engineering Mode</text>
</svg>`;

  return svg;
}



// Função utilitária para escurecer/clarear cores hex

function shadeColor(hex, percent) {
  let R = parseInt(hex.substring(1, 3), 16);
  let G = parseInt(hex.substring(3, 5), 16);
  let B = parseInt(hex.substring(5, 7), 16);


  R = parseInt(R * (100 + percent) / 100);
  G = parseInt(G * (100 + percent) / 100);
  B = parseInt(B * (100 + percent) / 100);


  R = (R < 255) ? R : 255;
  G = (G < 255) ? G : 255;
  B = (B < 255) ? B : 255;


  R = Math.round(R);

  G = Math.round(G);

  B = Math.round(B);


  const RR = ((R.toString(16).length == 1) ? "0" + R.toString(16) : R.toString(16));
  const GG = ((G.toString(16).length == 1) ? "0" + G.toString(16) : G.toString(16));
  const BB = ((B.toString(16).length == 1) ? "0" + B.toString(16) : B.toString(16));

  return "#" + RR + GG + BB;

}


async function main() {

  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GITHUB_TOKEN is required');
    const user = argv.user || process.env.GITHUB_ACTOR;
    const year = argv.year || new Date().getFullYear();
    const out = argv.out || 'assets/contrib-city.svg';
    const weeks = await fetchContributions(user, year, token);
    const days = flattenDays(weeks);
    const outDir = path.dirname(out);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const svg = createSVG(days, {});
    fs.writeFileSync(out, svg, 'utf8');
    console.log(`City generated at: ${out}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }

}

if (require.main === module) main();