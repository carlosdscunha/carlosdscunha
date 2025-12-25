#!/usr/bin/env node

/*
  Gera uma Cidade Cyberpunk Isométrica baseada no GitHub Calendar.
  Tema: Neon Engineering (Roxo, Azul, Ciano) com Reflexo no Chão
*/

const { graphql } = require("@octokit/graphql");
const fs = require("fs");
const path = require("path");
const argv = require("minimist")(process.argv.slice(2));

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

// --- Funções Auxiliares (Permanece igual) ---
async function fetchContributions(user, year, token) {
  const from = `${year}-01-01T00:00:00Z`;
  const to = `${year}-12-31T23:59:59Z`;
  const client = graphql.defaults({
    headers: { authorization: `token ${token}` },
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
      days.push({
        week: wi,
        dow: di,
        date: d.date,
        count: d.contributionCount,
      });
    });
  });
  return days;
}

// --- Função Principal de Geração do SVG ---
function createSVG(days, opts) {
  // Ajuste para garantir que o grid caiba (aumentei um pouco as margens)
  const weeks = Math.max(...days.map((d) => d.week)) + 2;
  const rows = 8;

  const tileW = opts.tileW || 42;
  const tileH = opts.tileH || 26;
  const maxCount = Math.max(...days.map((d) => d.count), 1);

  const colors = {
    bg: "#0d0019", // Fundo roxo muito escuro
    text_primary: "#e2e8f0", // Texto claro
    text_secondary: "#94a3b8", // Texto secundário
    palette: [
      "#9e3dff", // 0: // Roxo Neon Principal
      "#8a2be2", // 1
      "#7c3aed", // 2
      "#6d28d9", // 3
      "#4c1d95", // 4
      "#22d3ee", // 5: Ciano para o final
    ],
  };

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
    if (c === 0) return colors.bg;
    const ratio = c / maxCount;
    if (ratio < 0.1) return colors.palette[4];
    if (ratio < 0.2) return colors.palette[3];
    if (ratio < 0.4) return colors.palette[2];
    if (ratio < 0.7) return colors.palette[1];
    if (ratio < 0.8) return colors.palette[0];
    if (ratio < 1.0) return colors.palette[5];
    return colors.text_primary;
  }

  function shadeColor(hex, percent) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);

    r = Math.round(Math.min(255, Math.max(0, (r * (100 + percent)) / 100)));
    g = Math.round(Math.min(255, Math.max(0, (g * (100 + percent)) / 100)));
    b = Math.round(Math.min(255, Math.max(0, (b * (100 + percent)) / 100)));

    return `#${r.toString(16).padStart(2, "0")}${g
      .toString(16)
      .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
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
    <pattern id="scanlines" width="100%" height="4" patternUnits="userSpaceOnUse">
      <rect width="100%" height="1" fill="#ffffff" opacity="0.03"/>
    </pattern>
  </defs>`;

  // Ordenação (Painter's Algorithm)
  days.sort((a, b) => a.week + a.dow - (b.week + b.dow));

  days.forEach((d) => {
    const x = d.week;
    const y = d.dow;

    let zHeight = 0;
    if (d.count > 0) {
      // Altura um pouco mais dramática
      zHeight = 12 + Math.pow(d.count / maxCount, 1.1) * 200;
    }

    // Pontos da Base (Chão)
    const baseA = proj(x, y); // Topo (fundo)
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

    const glowFilter =
      d.count / maxCount > 0.6
        ? "url(#neon-glow)"
        : d.count / maxCount > 0.3
        ? "url(#soft-glow)"
        : "none";

    if (d.count > 0) {
      // --- NOVO: REFLEXO NO CHÃO (Ground Glow) ---
      // Determina a cor do reflexo (ciano para altos, magenta para médios)
      const reflectionColor = d.count / maxCount > 0.4 ? "#22d3ee" : "#c026d3";
      // Desenha a base com desfoque e transparência ANTES das paredes
      pieces.push(`<polygon points="${baseA.x},${baseA.y} ${baseB.x},${baseB.y} ${baseC.x},${baseC.y} ${baseD.x},${baseD.y}" 
        fill="${reflectionColor}" opacity="0.3" filter="url(#floor-blur)"/>`);

      // PAREDE ESQUERDA (FRENTE)
      pieces.push(
        `<polygon points="${baseD.x},${baseD.y} ${baseC.x},${baseC.y} ${topC.x},${topC.y} ${topD.x},${topD.y}" fill="${leftColor}"/>`
      );

      // PAREDE DIREITA (FRENTE)
      pieces.push(
        `<polygon points="${baseB.x},${baseB.y} ${baseC.x},${baseC.y} ${topC.x},${topC.y} ${topB.x},${topB.y}" fill="${rightColor}"/>`
      );

      // TOPO (Teto)
      pieces.push(`<polygon points="${topA.x},${topA.y} ${topB.x},${topB.y} ${
        topC.x
      },${topC.y} ${topD.x},${topD.y}" 
                    fill="${color}" stroke="${shadeColor(
        color,
        30
      )}" stroke-width="0.7" 
                    filter="${glowFilter}"/>`);

      // Detalhes: Janelas/LEDs laterais com brilho
      if (zHeight > 60) {
        const dots = Math.floor(zHeight / 35);
        for (let i = 1; i <= dots; i++) {
          const h = zHeight - i * 28;
          const pLeft = proj(x + 0.1, y + 0.8, h);
          const pRight = proj(x + 0.8, y + 0.1, h);

          // Adicionei filter="url(#neon-glow)" para brilhar
          pieces.push(
            `<circle cx="${pLeft.x}" cy="${pLeft.y}" r="1.8" fill="#ffe100" filter="url(#neon-glow)"/>`
          );
          pieces.push(
            `<circle cx="${pRight.x}" cy="${pRight.y}" r="1.8" fill="#ffe100" filter="url(#neon-glow)"/>`
          );
        }
      }
    } else {
      // Chão vazio (Grid mais sutil)
      pieces.push(`<polygon points="${baseA.x},${baseA.y} ${baseB.x},${baseB.y} ${baseC.x},${baseC.y} ${baseD.x},${baseD.y}" 
                    fill="none" stroke="#0d1117" stroke-width="0.4" opacity="0.5"/>`);
    }
  });

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
  ${defs}
  <rect width="100%" height="100%" fill="url(#bg-gradient)"/>
  <rect width="100%" height="100%" fill="url(#scanlines)"/>

  <g transform="translate(0, 20)"> ${pieces.join("\n    ")}
  </g>

  <text x="60" y="${
    height - 60
  }" class="title-text">CONTRIBUTION CITY • 2025</text>
  <text x="${width - 60}" y="${
    height - 60
  }" text-anchor="end" fill="#7c3aed" font-weight="bold" style="letter-spacing: 1px;">ENGINEERING MODE v2</text>
</svg>`;

  return svg;
}

// --- Função Principal de Execução ---
async function main() {
  try {
    // Tenta pegar do argumento --token, senão do ambiente
    const token = argv.token || process.env.GITHUB_TOKEN;
    if (!token)
      throw new Error("GITHUB_TOKEN is required (use --token or env var)");

    const user = argv.user || process.env.GITHUB_ACTOR;
    if (!user)
      throw new Error("GitHub User is required (use --user or env var)");

    const year = argv.year || new Date().getFullYear();
    const out = argv.out || "contrib-city-neon.svg";

    console.log(`Buscando contribuições para: ${user} (${year})...`);
    const weeks = await fetchContributions(user, year, token);
    const days = flattenDays(weeks);

    console.log("Gerando cidade isométrica...");
    const outDir = path.dirname(out);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const svg = createSVG(days, {});
    fs.writeFileSync(out, svg, "utf8");

    console.log(`Cidade cyberpunk gerada com sucesso: ${out}`);
  } catch (err) {
    console.error("Erro:", err.message || err);
    process.exit(1);
  }
}

if (require.main === module) main();
