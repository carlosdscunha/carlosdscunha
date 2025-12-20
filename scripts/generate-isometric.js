#!/usr/bin/env node
/*
   Contribution City - Cyberpunk Isométrica
   Tema: Neon Engineering (Roxo → Indigo → Ciano → Branco)
   Autor: Estudante de Engenharia da Computação
*/

import { graphql } from '@octokit/graphql';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
const argv = require('minimist')(process.argv.slice(2));

// Configurações visuais (você pode ajustar aqui)
const CONFIG = {
  tileW: 100,        // Largura do tile isométrico
  tileH: 50,         // Altura do tile
  maxBuildingHeight: 180, // Altura máxima dos arranha-céus
  minBuildingHeight: 8,
  glowIntensity: 12, // Glow nos topos mais fortes
};

async function fetchContributions(user, year, token) {
  const from = `${year}-01-01T00:00:00Z`;
  const to = `${year}-12-31T23:59:59Z`;

  const client = graphql.defaults({
    headers: { authorization: `token ${token}` },
  });

  const query = `
    query ($login: String!, $from: DateTime!, $to: DateTime!) {
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
    }
  `;

  const { user: { contributionsCollection } } = await client(query, { login: user, from, to });
  return contributionsCollection.contributionCalendar.weeks;
}

function flattenDays(weeks) {
  const days = [];
  weeks.forEach((week, weekIndex) => {
    week.contributionDays.forEach((day, dayIndex) => {
      days.push({
        week: weekIndex,
        dow: dayIndex,
        date: day.date,
        count: day.contributionCount,
      });
    });
  });
  return days;
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

function createSVG(days) {
  const weeksCount = Math.max(...days.map(d => d.week)) + 1;
  const { tileW, tileH, maxBuildingHeight, minBuildingHeight, glowIntensity } = CONFIG;

  // Paleta mantida exatamente como você queria
  const palette = [
    '#161b22', // 0 - vazio
    '#2e1065', // 1 - roxo escuro
    '#7c3aed', // 2 - roxo neon
    '#6366f1', // 3 - indigo
    '#22d3ee', // 4 - ciano elétrico
    '#ffffff', // 5 - branco puro (top)
  ];

  const maxCount = Math.max(...days.map(d => d.count), 1);

  // Dimensões totais da cidade
  const width = weeksCount * tileW + 600;
  const height = 7 * tileH + 400;

  const originX = 300;
  const originY = 150;

  function proj(x, y, z = 0) {
    const px = originX + (x - y) * (tileW / 2);
    const py = originY + (x + y) * (tileH / 2) - z;
    return { x: px.toFixed(1), y: py.toFixed(1) };
  }

  function getColor(count) {
    if (count === 0) return palette[0];
    const ratio = count / maxCount;
    if (ratio < 0.15) return palette[1];
    if (ratio < 0.35) return palette[2];
    if (ratio < 0.6) return palette[3];
    if (ratio < 0.85) return palette[4];
    return palette[5];
  }

  const elements = [];

  days.forEach(day => {
    const { week: x, dow: y, count } = day;

    // Altura do prédio (cresce de forma mais dramática nos dias intensos)
    const height = count > 0
      ? minBuildingHeight + Math.pow(count / maxCount, 1.3) * maxBuildingHeight
      : 0;

    const base = {
      a: proj(x, y),
      b: proj(x + 1, y),
      c: proj(x + 1, y + 1),
      d: proj(x, y + 1),
    };

    const top = {
      a: proj(x, y, height),
      b: proj(x + 1, y, height),
      c: proj(x + 1, y + 1, height),
      d: proj(x, y + 1, height),
    };

    const color = getColor(count);

    // Centro Y médio para ordenação de profundidade
    const depthY = (Object.values(base).reduce((s, p) => s + parseFloat(p.y), 0) +
      Object.values(top).reduce((s, p) => s + parseFloat(p.y), 0)) / 8;

    const parts = [];

    if (count > 0) {
      const leftShade = shadeColor(color, -35);
      const rightShade = shadeColor(color, -18);
      const glowColor = count / maxCount > 0.7 ? '#22d3ee' : color;

      // Lado esquerdo (mais escuro)
      parts.push(`<polygon points="${base.d.x},${base.d.y} ${base.a.x},${base.a.y} ${top.a.x},${top.a.y} ${top.d.x},${top.d.y}" fill="${leftShade}"/>`);

      // Lado direito
      parts.push(`<polygon points="${base.b.x},${base.b.y} ${base.c.x},${base.c.y} ${top.c.x},${top.c.y} ${top.b.x},${top.b.y}" fill="${rightShade}"/>`);

      // Topo com glow neon
      parts.push(`
        <defs>
          <filter id="glow-${x}-${y}" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="${glowIntensity}" result="glow"/>
            <feFlood flood-color="${glowColor}"/>
            <feComposite in="glow" in2="SourceGraphic" operator="in"/>
            <feMerge>
              <feMergeNode/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <polygon points="${top.a.x},${top.a.y} ${top.b.x},${top.b.y} ${top.c.x},${top.c.y} ${top.d.x},${top.d.y}"
                 fill="${color}" stroke="${shadeColor(color, 30)}" stroke-width="1"
                 filter="${count / maxCount > 0.5 ? `url(#glow-${x}-${y})` : ''}"/>
      `);
    } else {
      // Grid sutil no chão
      parts.push(`<polygon points="${base.a.x},${base.a.y} ${base.b.x},${base.b.y} ${base.c.x},${base.c.y} ${base.d.x},${base.d.y}"
                   fill="none" stroke="#1e293b" stroke-width="0.8" opacity="0.6"/>`);
    }

    elements.push({ depthY, parts });
  });

  // Ordenar do fundo para frente
  elements.sort((a, b) => a.depthY - b.depthY);
  const citySVG = elements.flatMap(e => e.parts).join('\n    ');

  const year = new Date().getFullYear();

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
  <defs>
    <linearGradient id="sky" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="60%" stop-color="#1e1b4b"/>
      <stop offset="100%" stop-color="#312e81"/>
    </linearGradient>
    <style>
      text { font-family: 'Segoe UI', 'Ubuntu', system-ui, sans-serif; }
      .title { font-size: 28px; font-weight: bold; fill: #e2e8f0; }
      .subtitle { font-size: 18px; fill: #94a3b8; }
      .accent { fill: #22d3ee; font-weight: bold; }
    </style>
  </defs>

  <rect width="100%" height="100%" fill="url(#sky)"/>

  <g>
    ${citySVG}
  </g>

  <!-- Título e legenda -->
  <text x="40" y="80" class="title">Contribution City</text>
  <text x="40" y="110" class="subtitle">${year} • Neon Engineering Mode</text>
  <text x="${width - 40}" y="${height - 40}" text-anchor="end" class="accent">@${days[0]?.date?.split('-')[0] || 'you'}</text>
  <text x="${width - 40}" y="${height - 15}" text-anchor="end" class="subtitle">Powered by GitHub Contributions</text>
</svg>`;
}

async function main() {
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('Defina GITHUB_TOKEN no ambiente');

    const user = argv.user || argv.u || process.env.GITHUB_ACTOR;
    if (!user) throw new Error('Informe o usuário com --user ou GITHUB_ACTOR');

    const year = argv.year || argv.y || new Date().getFullYear();
    const output = argv.out || argv.o || 'assets/contribution-city.svg';

    console.log(`Gerando cidade cyberpunk para @${user} em ${year}...`);

    const weeks = await fetchContributions(user, year, token);
    const days = flattenDays(weeks);

    const svg = createSVG(days);

    const outDir = dirname(output);
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }

    writeFileSync(output, svg, 'utf8');
    console.log(`✨ Cidade gerada com sucesso: ${output}`);
  } catch (error) {
    console.error('Erro:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}