#!/usr/bin/env node

/*
  Gera um gráfico de barras Neon para o GitHub README.
  Tema: Cyberpunk Engineering (Roxo/Azul)
  Autor: Adaptado para Carlos Daniel
*/

const { graphql } = require("@octokit/graphql");
const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

// --- Configurações Visuais ---
const width = 450;
const height = 220;
const padding = 20;
const barHeight = 12;
const barGap = 25;
const maxLangs = 6;

// Paleta de cores Neon
const colors = {
  bg: "#0d0019", // Fundo roxo muito escuro
  textPrimary: "#e2e8f0", // Texto claro
  textSecondary: "#94a3b8", // Texto secundário
  barColors: [
    "#9e3dff", // 0: // Roxo Neon Principal
    "#8a2be2", // 1
    "#7c3aed", // 2
    "#6d28d9", // 3
    "#4c1d95", // 4
    "#22d3ee", // 5: Ciano para o final
  ],
};

// --- 1. Buscar Dados da API do GitHub ---
async function fetchLanguageStats(token) {
  const client = graphql.defaults({
    headers: {
      authorization: `token ${token}`, // O espaço depois de 'token' é obrigatório
    },
  });

  // Query para pegar linguagens de repositórios PRÓPRIOS (públicos e privados)
  // Exclui forks para focar no seu código real.
  const query = `query {
    viewer {
      repositories(first: 100, ownerAffiliations: OWNER, isFork: false, orderBy: {field: PUSHED_AT, direction: DESC}) {
        nodes {
          name
          languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
            edges {
              size
              node {
                name
                color
              }
            }
          }
        }
      }
    }
  }`;

  const res = await client(query);
  const repos = res.viewer.repositories.nodes;

  // Processar e somar os tamanhos das linguagens
  const langStats = {};
  let totalSize = 0;

  repos.forEach((repo) => {
    repo.languages.edges.forEach((edge) => {
      const langName = edge.node.name;
      const size = edge.size;

      // Filtros opcionais (ex: ignorar HTML/CSS se quiser focar em lógica)
      // if (langName === 'HTML' || langName === 'CSS') return;

      langStats[langName] = (langStats[langName] || 0) + size;
      totalSize += size;
    });
  });

  // Converter para array, ordenar e pegar os top N
  let sortedLangs = Object.entries(langStats)
    .map(([name, size]) => ({ name, size, percent: (size / totalSize) * 100 }))
    .sort((a, b) => b.size - a.size)
    .slice(0, maxLangs);

  return sortedLangs;
}

// --- 2. Gerar o SVG ---
function createSVG(langs) {
  let svgContent = "";
  let currentY = padding + 40; // Espaço para o título

  langs.forEach((lang, index) => {
    const barColor = colors.barColors[index % colors.barColors.length];
    const barWidth = (width - padding * 3 - 120) * (lang.percent / 100);

    // Nome da Linguagem
    svgContent += `<text x="${padding}" y="${currentY}" fill="${colors.textPrimary}" font-size="14" font-weight="600" dominant-baseline="middle">${lang.name}</text>`;

    // Fundo da barra (trilho escuro)
    svgContent += `<rect x="${padding + 100}" y="${
      currentY - barHeight / 2
    }" width="${
      width - padding * 3 - 100
    }" height="${barHeight}" fill="#1e1b4b" rx="4" ry="4"/>`;

    // Barra de progresso Neon
    svgContent += `<rect x="${padding + 100}" y="${
      currentY - barHeight / 2
    }" width="${barWidth}" height="${barHeight}" fill="${barColor}" rx="4" ry="4">
      <animate attributeName="width" from="0" to="${barWidth}" dur="1s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.2 1"/>
    </rect>`;

    // Porcentagem
    svgContent += `<text x="${width - padding}" y="${currentY}" fill="${
      colors.textSecondary
    }" font-size="12" text-anchor="end" dominant-baseline="middle">${lang.percent.toFixed(
      1
    )}%</text>`;

    currentY += barGap;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <style>text { font-family: 'Segoe UI', Ubuntu, sans-serif; }</style>
        <linearGradient id="card-bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0d0019"/>
            <stop offset="100%" stop-color="#1a103c"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#card-bg)" rx="10" ry="10" stroke="#9e3dff" stroke-width="1" stroke-opacity="0.3"/>
      <text x="${padding}" y="${
    padding + 15
  }" fill="#9e3dff" font-size="18" font-weight="bold">Tech Stack &amp; Linguagens</text>
      ${svgContent}
    </svg>`;
}

// --- Função Principal ---
async function main() {
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN is required");

    const out = "assets/my-lang-stats.svg";
    console.log("Buscando dados de repositórios (Públicos e Privados)...");
    const langs = await fetchLanguageStats(token);

    console.log("Gerando gráfico Neon...");
    const outDir = path.dirname(out);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const svg = createSVG(langs);
    fs.writeFileSync(out, svg, "utf8");

    console.log(`Gráfico gerado com sucesso: ${out}`);
  } catch (err) {
    console.error("Erro:", err.message);
    process.exit(1);
  }
}

main();
