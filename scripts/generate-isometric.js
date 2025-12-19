#!/usr/bin/env node
/*
   Gera uma Cidade Cyberpunk Isométrica.
   Tema: Neon Engineering (Roxo, Azul, Ciano) com prédios altos.
*/

const { graphql } = require('@octokit/graphql');
const fs = require('fs');
const path = require('path');
const argv = require('minimist')(process.argv.slice(2));

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

  // PALETA NEON CYBERPUNK
  // Escala de intensidade: Roxo Escuro -> Magenta -> Ciano Brilhante
  const palette = [
    '#161b22', // 0: Chão (invisível)
    '#3b0764', // 1: Roxo base
    '#6b21a8', // 2: Roxo médio
    '#a21caf', // 3: Magenta escuro
    '#e879f9', // 4: Rosa neon
    '#22d3ee'  // 5: Ciano elétrico (Top!)
  ];

  const width = (weeks + rows) * (tileW / 2) + 60;
  const height = (weeks + rows) * (tileH / 2) + 400; // Mais espaço vertical

  const originX = 30 + rows * (tileW / 2);
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
    if (ratio < 0.6) return palette[3];
    if (ratio < 0.8) return palette[4];
    return palette[5];
  }

  // Função para escurecer cores (para sombras)
  function shadeColor(hex, percent) {
    let R = parseInt(hex.substring(1, 3), 16);
    let G = parseInt(hex.substring(3, 5), 16);
    let B = parseInt(hex.substring(5, 7), 16);
    R = parseInt(R * (100 + percent) / 100);
    G = parseInt(G * (100 + percent) / 100);
    B = parseInt(B * (100 + percent) / 100);
    R = (R < 255) ? R : 255; G = (G < 255) ? G : 255; B = (B < 255) ? B : 255;
    R = Math.round(R); G = Math.round(G); B = Math.round(B);
    return "#" + (R.toString(16).padStart(2, '0')) + (G.toString(16).padStart(2, '0')) + (B.toString(16).padStart(2, '0'));
  }

  let pieces = [];

  days.forEach(d => {
    const x = d.week;
    const y = d.dow;

    let zHeight = 0;
    if (d.count > 0) {
      // FÓRMULA DE ARRANHA-CÉU: Crescimento exponencial para ficar alto!
      // Mínimo 10px, Máximo 200px de altura
      zHeight = 10 + Math.pow((d.count / maxCount), 1.5) * 200;
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
    const leftShade = shadeColor(color, -30); // Lado escuro
    const rightShade = shadeColor(color, -15); // Lado médio

    if (d.count > 0) {
      // Paredes
      pieces.push(`<polygon points="${topD.x},${topD.y} ${topC.x},${topC.y} ${baseC.x},${baseC.y} ${baseD.x},${baseD.y}" fill="${leftShade}"/>`);
      pieces.push(`<polygon points="${topA.x},${topA.y} ${topB.x},${topB.y} ${baseB.x},${baseB.y} ${baseA.x},${baseA.y}" fill="${rightShade}"/>`);
      // Teto brilhante com borda
      pieces.push(`<polygon points="${topA.x},${topA.y} ${topB.x},${topB.y} ${topC.x},${topC.y} ${topD.x},${topD.y}" fill="${color}" stroke="${shadeColor(color, 20)}" stroke-width="0.5"/>`);
    } else {
      // Grid do chão sutil
      pieces.push(`<polygon points="${baseA.x},${baseA.y} ${baseB.x},${baseB.y} ${baseC.x},${baseC.y} ${baseD.x},${baseD.y}" fill="none" stroke="#2d3748" stroke-width="0.3" opacity="0.5"/>`);
    }
  });

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
  <defs>
    <style>text { font-family: 'Segoe UI', sans-serif; fill: #94a3b8; font-size: 14px; }</style>
    <linearGradient id="bg-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#0f172a;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1e1b4b;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg-gradient)" />
  <g transform="translate(0,20)">${pieces.join('')}</g>
  <text x="30" y="${height - 30}">Contribution City • 2025</text>
  <text x="${width - 30}" y="${height - 30}" text-anchor="end" fill="#22d3ee">Cyberpunk Mode</text>
</svg>`;

  return svg;
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
  } catch (err) { console.error(err); process.exit(1); }
}

if (require.main === module) main();