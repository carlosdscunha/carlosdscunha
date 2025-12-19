function createSVG(days, opts) {
  const weeks = Math.max(...days.map(d => d.week)) + 1;
  const rows = 7;

  const tileW = opts.tileW || 42;
  const tileH = opts.tileH || 26;
  const maxCount = Math.max(...days.map(d => d.count)) || 1;

  const palette = [
    '#161b22',
    '#2e1065',
    '#7c3aed',
    '#c026d3',
    '#22d3ee',
    '#ffffff'
  ];

  const width = (weeks + rows) * (tileW / 2) + 60;
  const height = (weeks + rows) * (tileH / 2) + 300;

  const originX = 30 + rows * (tileW / 2);
  const originY = 60;

  function proj(x, y, z = 0) {
    const px = originX + (x - y) * (tileW / 2);
    const py = originY + (x + y) * (tileH / 2) - z;
    return { x: px.toFixed(1), y: py.toFixed(1) };
  }

  function colorForCount(c) {
    if (c === 0) return palette[0];
    const r = c / maxCount;
    if (r < 0.2) return palette[1];
    if (r < 0.4) return palette[2];
    if (r < 0.7) return palette[3];
    if (r < 0.9) return palette[4];
    return palette[5];
  }

  let pieces = [];

  days.forEach(d => {
    const x = d.week;
    const y = d.dow;

    let zHeight = 0;
    if (d.count > 0) {
      zHeight = 6 + Math.pow(d.count / maxCount, 1.2) * 140;
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

    const jitter = (d.week % 3 - 1) * 8;
    const leftColor = shadeColor(color, -30 + jitter);
    const rightColor = shadeColor(color, -15 + jitter);

    if (d.count > 0) {
      // ANDARES
      const floorH = 10;
      const floors = Math.max(1, Math.floor(zHeight / floorH));

      for (let i = 0; i < floors; i++) {
        const z0 = i * floorH;
        const z1 = Math.min(zHeight, z0 + floorH);

        const fA = proj(x, y, z0);
        const fB = proj(x + 1, y, z0);
        const fC = proj(x + 1, y + 1, z0);
        const fD = proj(x, y + 1, z0);

        const tA = proj(x, y, z1);
        const tB = proj(x + 1, y, z1);
        const tC = proj(x + 1, y + 1, z1);
        const tD = proj(x, y + 1, z1);

        pieces.push(
          `<polygon points="${tD.x},${tD.y} ${tC.x},${tC.y} ${fC.x},${fC.y} ${fD.x},${fD.y}" fill="${leftColor}"/>`
        );
        pieces.push(
          `<polygon points="${tA.x},${tA.y} ${tB.x},${tB.y} ${fB.x},${fB.y} ${fA.x},${fA.y}" fill="${rightColor}"/>`
        );
      }

      // TOPO NEON
      pieces.push(
        `<polygon points="${topA.x},${topA.y} ${topB.x},${topB.y} ${topC.x},${topC.y} ${topD.x},${topD.y}"
                 fill="${color}" stroke="#22d3ee" stroke-width="1"/>`
      );

      // ANTENA
      const antennaBase = proj(x + 0.5, y + 0.5, zHeight);
      const antennaTop = proj(x + 0.5, y + 0.5, zHeight + 18);
      pieces.push(
        `<line x1="${antennaBase.x}" y1="${antennaBase.y}"
                       x2="${antennaTop.x}" y2="${antennaTop.y}"
                       stroke="#7c3aed" stroke-width="1"/>`
      );
    } else {
      pieces.push(
        `<polygon points="${baseA.x},${baseA.y} ${baseB.x},${baseB.y} ${baseC.x},${baseC.y} ${baseD.x},${baseD.y}"
                 fill="none" stroke="#2d3748" stroke-width="0.5"/>`
      );
    }
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e1b4b"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg-gradient)"/>
  <g transform="translate(0,20)">
    ${pieces.join('\n')}
  </g>
</svg>`;
}
