/*
  Gera um gráfico de barras Neon para o GitHub README.
  Tema: Cyberpunk Engineering (Roxo/Azul)
  Autor: Adaptado para Carlos Daniel
*/
import { graphql } from "@octokit/graphql";
import fs from "fs"
import path from "path"
import dotenv from "dotenv"


dotenv.config({ path: path.resolve(__dirname, "../.env") });

// --- Configurações Visuais ---
const WIDTH = 450;
const HEIGHT = 220;
const PADDING = 20;
const BAR_HEIGHT = 12;
const BAR_GAP = 25;
const MAX_LANGS = 6;

interface Node {
  name: string;
  color: string;
}

interface Edge {
  size: number;
  node: Node;
}

interface Languages {
  edges: Edge[];
}

interface Nodes {
  name: string;
  languages: Languages;
}

interface LangStat {
  name: string;
  size: number;
  color: string;
  percent: number;
}

// Paleta de cores Neon
const colors = {
  bg: "#051900ff", // Fundo roxo muito escuro
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
// --- Funções Auxiliares (Permanece igual) ---
async function fetchContributions(token: string): Promise<Nodes[]> {
  const client = graphql.defaults({
    headers: { authorization: `token ${token}` },
  });

  // Query para pegar linguagens de repositórios PRÓPRIOS (públicos e privados)
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

  const res: any = await client(query);
  return res.viewer.repositories.nodes;
}


function fetchLanguageStats(nodes: Nodes[]): LangStat[] {

  // Processar e somar os tamanhos das linguagens
  const langStats: Record<string, LangStat> = {};
  let totalSize = 0;

  nodes.forEach((repo) => {
    repo.languages.edges.forEach((edge) => {
      const langName = edge.node.name;
      const langColor = edge.node.color;
      const size = edge.size;

      // Filtro: ignora linguagens específicas
      if (['GDShader', 'ShaderLab'].includes(langName)) return;

      if (!langStats[langName]) langStats[langName] = { name: "", size: 0, color: langColor, percent: 0 };
      langStats[langName].size += size;
      totalSize += size;
    });
  });

  // Converter para array, ordenar e pegar os top N
  let sortedLangs: LangStat[] = Object.entries(langStats)
    .map(([name, data]) => ({
      name: name,
      size: data.size,
      color: data.color,
      percent: (data.size / totalSize) * 100
    }))
    .sort((a, b) => b.size - a.size);

  return sortedLangs;
}

// --- 2. Gerar o SVG ---
function createSVG(langs: LangStat[]): string {
  const lineHeight = 10; // Distância vertical entre cada número
  let svgContent: string[] = [];
  let currentY = PADDING + 40; // Espaço para o título

  let defs: string[] = [`<filter id="neon-glow" x="-600%" y="-100%" width="1000%" height="300%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <style>text { font-family: 'Segoe UI', Ubuntu, sans-serif; }</style>
    <linearGradient id="card-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0d0019" />
      <stop offset="100%" stop-color="#1a103c" />
    </linearGradient>`];

  langs.forEach((lang, index) => {
    const barColor = colors.barColors[index % colors.barColors.length];
    const barWidth = (WIDTH - PADDING * 3 - 120) * (lang.percent / 100);

    // Nome da Linguagem
    svgContent.push(`  <text x="${PADDING}" y="${currentY}" fill="${lang.color}" font-size="14" font-weight="600" dominant-baseline="middle">${lang.name}</text>`);

    // Fundo da barra (trilho escuro)
    svgContent.push(`  <rect x="${PADDING + 100}" y="${currentY - BAR_HEIGHT / 2}" width="${WIDTH - PADDING * 4 - 100}" height="${BAR_HEIGHT}" fill="#1e1b4b" rx="4" ry="4" />`);

    // Barra de progresso Neon
    svgContent.push(`  <rect x="${PADDING + 100}" y="${currentY - BAR_HEIGHT / 2}" width="${barWidth}" height="${BAR_HEIGHT}" fill="${barColor}" rx="4" ry="4" filter="url(#neon-glow)">
    <animate
      attributeName="width"
      from="0"
      to="${barWidth}"
      dur="5s"
      fill="freeze"
      calcMode="spline"
      keyTimes="0;1"
      keySplines="0.4 0 0.2 1" />
  </rect>`);

    defs.push(`    <clipPath id="${lang.name}-window">
      <rect x="${WIDTH - PADDING - 40}" y="${currentY - 6}" width="29.5" height="${lineHeight}" />
    </clipPath>`);
    const steps: number[] = []; // Números que vão "correr"
    for (let i = 0; i < Math.floor(lang.percent); i += 2) {
      steps.push(i);
    }

    steps.push(lang.percent);

    // Criamos a coluna de números
    const numbers = steps.map((num, i) => `<text x="0" y="${i * lineHeight}" fill="${colors.textSecondary}" font-size="12" font-weight="bold" text-anchor="end" dominant-baseline="middle">${num.toFixed(1)}</text>`).join("\n        ");

    svgContent.push(`  <g clip-path="url(#${lang.name}-window)">
    <g transform="translate(${WIDTH - PADDING - 10}, ${currentY})">
      <g>
        ${numbers}
        <animateTransform 
          attributeName="transform" 
          type="translate" 
          from="0 0" 
          to="0 -${(steps.length - 1) * lineHeight}" 
          dur="5s" 
          fill="freeze"
          calcMode="spline"
          keyTimes="0;1"
          keySplines="0.4 0 0.2 1" />
      </g>
    </g>
  </g>  
  <text x="${WIDTH - PADDING}" y="${currentY}" fill="${colors.textSecondary}" font-size="12" font-weight="bold" text-anchor="end" dominant-baseline="middle">%</text>`);

    currentY += BAR_GAP;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img">
  <defs>
    ${defs.join("\n")}
  </defs>
  <rect width="100%" height="100%" fill="url(#card-bg)" rx="10" ry="10" stroke="#9e3dff" stroke-width="2" stroke-opacity="0.3"/>
  <text x="${PADDING}" y="${PADDING + 15}" fill="#9e3dff" font-size="18" font-weight="bold">Tech Stack &amp; Linguagens</text>      
  ${svgContent.join("\n")}
</svg>`;
}

// --- Função Principal ---
async function main() {
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN is required");

    const out = "assets/my-lang-stats.svg";
    console.log("Buscando dados de repositórios (Públicos e Privados)...");
    const nodes: Nodes[] = await fetchContributions(token);
    const langs = fetchLanguageStats(nodes);

    console.log("Gerando gráfico Neon...");
    const outDir = path.dirname(out);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const svg = createSVG(langs);
    fs.writeFileSync(out, svg, "utf8");

    console.log(`Gráfico gerado com sucesso: ${out}`);
  } catch (err: any) {
    console.error("Erro:", err.message || err);
    process.exit(1);
  }
}

if (require.main === module) main();
