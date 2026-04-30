// Auto-generated from iq-test Ver 8.html lines 911-2122.
// DO NOT EDIT BY HAND. To regenerate: node outputs/extract-c-lite.js.
// Used by the Netlify Function to render figure SVGs server-side at session assemble time.

/* --------------- SVG RENDERING HELPERS --------------- */
function shape(kind, cx, cy, size, opts = {}) {
  const { fill = '#1f2937', stroke = 'none', strokeWidth = 0, rotate = 0, pattern = 'solid' } = opts;
  const f = pattern === 'outline' ? 'none' : (pattern === 'striped' ? 'url(#stripes)' : fill);
  const s = pattern === 'outline' ? fill : stroke;
  const sw = pattern === 'outline' ? 3 : strokeWidth;
  const rot = rotate ? `transform="rotate(${rotate} ${cx} ${cy})"` : '';
  switch(kind) {
    case 'circle':
      return `<circle cx="${cx}" cy="${cy}" r="${size}" fill="${f}" stroke="${s}" stroke-width="${sw}" ${rot}/>`;
    case 'square':
      return `<rect x="${cx-size}" y="${cy-size}" width="${size*2}" height="${size*2}" fill="${f}" stroke="${s}" stroke-width="${sw}" ${rot}/>`;
    case 'triangle':
      return `<polygon points="${cx},${cy-size} ${cx+size*0.9},${cy+size*0.7} ${cx-size*0.9},${cy+size*0.7}" fill="${f}" stroke="${s}" stroke-width="${sw}" ${rot}/>`;
    case 'diamond':
      return `<polygon points="${cx},${cy-size} ${cx+size},${cy} ${cx},${cy+size} ${cx-size},${cy}" fill="${f}" stroke="${s}" stroke-width="${sw}" ${rot}/>`;
    case 'arrow':
      return `<g ${rot}><line x1="${cx}" y1="${cy+size}" x2="${cx}" y2="${cy-size}" stroke="${fill}" stroke-width="5" stroke-linecap="round"/><polygon points="${cx},${cy-size} ${cx-size*0.5},${cy-size*0.4} ${cx+size*0.5},${cy-size*0.4}" fill="${fill}"/></g>`;
    case 'dots':
      // size = count 1-6
      const pts = [];
      const count = size;
      for (let i = 0; i < count; i++) {
        const col = i % 3, row = Math.floor(i / 3);
        const dx = cx - 18 + col * 18;
        const dy = cy - 9 + row * 18;
        pts.push(`<circle cx="${dx}" cy="${dy}" r="5" fill="${fill}"/>`);
      }
      return pts.join('');
    default: return '';
  }
}
function matrix3x3(cells, opts = {}) {
  const size = 330;
  const cell = 110;
  const defs = `<defs>
    <pattern id="stripes" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="8" stroke="#1f2937" stroke-width="3"/>
    </pattern>
  </defs>`;
  let svg = `<svg class="matrix-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${defs}`;
  // grid lines
  for (let i = 1; i < 3; i++) {
    svg += `<line x1="${i*cell}" y1="0" x2="${i*cell}" y2="${size}" stroke="#e5e7eb" stroke-width="1"/>`;
    svg += `<line x1="0" y1="${i*cell}" x2="${size}" y2="${i*cell}" stroke="#e5e7eb" stroke-width="1"/>`;
  }
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cx = c * cell + cell / 2;
      const cy = r * cell + cell / 2;
      const cellData = cells[r * 3 + c];
      if (cellData === '?') {
        svg += `<text x="${cx}" y="${cy+14}" text-anchor="middle" font-size="44" font-weight="700" fill="#9ca3af">?</text>`;
      } else if (typeof cellData === 'function') {
        svg += cellData(cx, cy);
      } else if (Array.isArray(cellData)) {
        cellData.forEach(fn => { svg += fn(cx, cy); });
      }
    }
  }
  svg += '</svg>';
  return svg;
}
function choiceSvg(drawFn) {
  const size = 80;
  const defs = `<defs><pattern id="stripes" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#1f2937" stroke-width="3"/></pattern></defs>`;
  return `<svg class="choice-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${defs}${drawFn(size/2, size/2)}</svg>`;
}
function barChartSvg(labels, values, highlight = -1) {
  const W = 420, H = 220, pad = 30;
  const maxV = Math.max(...values);
  const bw = (W - pad * 2) / values.length;
  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="background:#fafafa;border:1px solid #e5e7eb;border-radius:8px;">`;
  svg += `<line x1="${pad}" y1="${H-pad}" x2="${W-pad/2}" y2="${H-pad}" stroke="#9ca3af" stroke-width="1"/>`;
  values.forEach((v, i) => {
    const bh = (v / maxV) * (H - pad * 2);
    const x = pad + i * bw + bw * 0.15;
    const y = H - pad - bh;
    const w = bw * 0.7;
    const color = i === highlight ? '#2563eb' : '#60a5fa';
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${bh}" fill="${color}" rx="2"/>`;
    svg += `<text x="${x + w/2}" y="${y - 6}" text-anchor="middle" font-size="13" fill="#1a1a1a" font-weight="600">${v}</text>`;
    svg += `<text x="${x + w/2}" y="${H-pad+18}" text-anchor="middle" font-size="12" fill="#6b7280">${labels[i]}</text>`;
  });
  svg += '</svg>';
  return svg;
}
function tableSvg(headers, rows) {
  let h = '<div style="overflow:auto;"><table class="data" style="margin:0;">';
  h += '<thead><tr>' + headers.map(x => `<th>${x}</th>`).join('') + '</tr></thead><tbody>';
  rows.forEach(r => { h += '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>'; });
  h += '</tbody></table></div>';
  return h;
}

/* Render one domino face (one half of a tile) centered at (cx, cy) with width w
   and height h. val is the pip count 0–6. Uses standard domino dot positions. */
function dominoFace(cx, cy, w, h, val) {
  const pipR = Math.min(w, h) * 0.10;
  const dx = w * 0.28;
  const dy = h * 0.28;
  const positions = {
    0: [],
    1: [[0,0]],
    2: [[-1,-1],[1,1]],
    3: [[-1,-1],[0,0],[1,1]],
    4: [[-1,-1],[1,-1],[-1,1],[1,1]],
    5: [[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],
    6: [[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]]
  }[val] || [];
  let svg = `<rect x="${cx-w/2}" y="${cy-h/2}" width="${w}" height="${h}" fill="#fff" stroke="#1f2937" stroke-width="2"/>`;
  positions.forEach(([px, py]) => {
    svg += `<circle cx="${cx + px*dx}" cy="${cy + py*dy}" r="${pipR}" fill="#1f2937"/>`;
  });
  return svg;
}

/* Render a horizontal domino tile (two faces side-by-side) centered at (cx, cy).
   halfW = width of one face; h = tile height. Total tile width = 2 * halfW. */
function dominoTile(cx, cy, leftVal, rightVal, halfW = 30, h = 44) {
  const leftCx = cx - halfW / 2;
  const rightCx = cx + halfW / 2;
  return dominoFace(leftCx, cy, halfW, h, leftVal)
       + dominoFace(rightCx, cy, halfW, h, rightVal);
}

/* Render a sequence of dominoes for a series question. tiles is an array of
   [leftVal, rightVal] arrays, with null for the missing slot. */
function dominoSequenceFigure(tiles) {
  const halfW = 36;
  const tileW = halfW * 2;
  const tileH = 50;
  const gap = 14;
  const padding = 12;
  const totalW = tiles.length * tileW + (tiles.length - 1) * gap + padding * 2;
  const totalH = tileH + padding * 2;
  let svg = `<svg class="matrix-svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" xmlns="http://www.w3.org/2000/svg">`;
  tiles.forEach((t, i) => {
    const cx = padding + i * (tileW + gap) + tileW / 2;
    const cy = padding + tileH / 2;
    if (t === null) {
      svg += `<rect x="${cx - tileW/2}" y="${cy - tileH/2}" width="${tileW}" height="${tileH}" fill="#fafafa" stroke="#9ca3af" stroke-width="2" stroke-dasharray="5 4"/>`;
      svg += `<text x="${cx}" y="${cy + 9}" text-anchor="middle" font-size="26" font-weight="800" fill="#9ca3af">?</text>`;
    } else {
      svg += dominoTile(cx, cy, t[0], t[1], halfW, tileH);
    }
  });
  svg += '</svg>';
  return svg;
}

/* Render a horizontal sequence of numeric boxes for a number-series question.
   values is an array of numbers, with null for the missing slot. */
function numberSeriesFigure(values) {
  const boxW = 58;
  const boxH = 54;
  const gap = 10;
  const padding = 12;
  const totalW = values.length * boxW + (values.length - 1) * gap + padding * 2;
  const totalH = boxH + padding * 2;
  let svg = `<svg class="matrix-svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" xmlns="http://www.w3.org/2000/svg">`;
  values.forEach((v, i) => {
    const cx = padding + i * (boxW + gap) + boxW / 2;
    const cy = padding + boxH / 2;
    const isMissing = v === null;
    const stroke = isMissing ? '#9ca3af' : '#1f2937';
    const dash = isMissing ? '5 4' : '0';
    const fill = isMissing ? '#fafafa' : '#fff';
    svg += `<rect x="${cx - boxW/2}" y="${cy - boxH/2}" width="${boxW}" height="${boxH}" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-dasharray="${dash}" rx="6"/>`;
    const text = isMissing ? '?' : String(v);
    const color = isMissing ? '#9ca3af' : '#1f2937';
    svg += `<text x="${cx}" y="${cy + 9}" text-anchor="middle" font-size="22" font-weight="800" fill="${color}" font-family="Menlo, Monaco, monospace">${text}</text>`;
  });
  svg += '</svg>';
  return svg;
}

/* --------------- QUESTION BANK (59-item pool; 28 sampled per session via SESSION_QUOTAS:
   pattern 16 (1 matrix + 2 arrows + 3 series + 10 dominoes; sample 8 = 1m+1a+1s+5d)
   verbal 11 (sample 5)
   logical 9 (sample 4)
   spatial 6 (sample 3)
   numerical 11 (sample 5)
   sjt 6 (sample 3))
   Note: matrix sub-pool is deterministic (1 item) until Phase 2 expansion. Acceptable
   for controlled early-rollout; low leakage risk at current candidate volumes.
--------------- */

const figureMap = {
  'p1': () => dominoSequenceFigure([
      [1, 2],
      [2, 3],
      [3, 5],
      [5, 1],
      [1, 6],
      null
    ]),
  'p2': () => matrix3x3([
      (cx,cy)=>shape('circle',cx,cy,14,{pattern:'outline'}),    (cx,cy)=>shape('square',cx,cy,20,{pattern:'striped'}),    (cx,cy)=>shape('triangle',cx,cy,30,{pattern:'solid'}),
      (cx,cy)=>shape('triangle',cx,cy,20,{pattern:'solid'}),    (cx,cy)=>shape('circle',cx,cy,30,{pattern:'outline'}),    (cx,cy)=>shape('square',cx,cy,14,{pattern:'striped'}),
      (cx,cy)=>shape('square',cx,cy,30,{pattern:'striped'}),    (cx,cy)=>shape('triangle',cx,cy,14,{pattern:'solid'}),    '?'
    ]),
  'p3': () => matrix3x3([
      (cx,cy)=>shape('arrow',cx,cy,24,{rotate:0,   fill:'#2563eb'}), (cx,cy)=>shape('arrow',cx,cy,24,{rotate:90,  fill:'#10b981'}), (cx,cy)=>shape('arrow',cx,cy,24,{rotate:180, fill:'#ef4444'}),
      (cx,cy)=>shape('arrow',cx,cy,24,{rotate:90,  fill:'#ef4444'}), (cx,cy)=>shape('arrow',cx,cy,24,{rotate:180, fill:'#2563eb'}), (cx,cy)=>shape('arrow',cx,cy,24,{rotate:270, fill:'#10b981'}),
      (cx,cy)=>shape('arrow',cx,cy,24,{rotate:180, fill:'#10b981'}), (cx,cy)=>shape('arrow',cx,cy,24,{rotate:270, fill:'#ef4444'}), '?'
    ]),
  'p4': () => dominoSequenceFigure([
      [2, 0],
      [3, 2],
      [4, 4],
      [5, 6],
      [6, 1],
      null
    ]),
  'p5': () => numberSeriesFigure([3, 6, 10, 20, 24, 48, 52, null]),
  'p6': () => dominoSequenceFigure([
      [0, 2],
      [1, 3],
      [2, 4],
      [3, 5],
      [4, 6],
      null
    ]),
  'p7': () => dominoSequenceFigure([
      [0, 0],
      [1, 2],
      [2, 4],
      [3, 6],
      [4, 1],
      null
    ]),
  'p8': () => dominoSequenceFigure([
      [1, 3],
      [3, 1],
      [2, 5],
      [5, 2],
      [0, 6],
      null
    ]),
  'p10': () => matrix3x3([
      (cx,cy)=>shape('arrow',cx,cy,24,{rotate:0,   fill:'#f97316'}), (cx,cy)=>shape('arrow',cx,cy,24,{rotate:90,  fill:'#8b5cf6'}), (cx,cy)=>shape('arrow',cx,cy,24,{rotate:180, fill:'#14b8a6'}),
      (cx,cy)=>shape('arrow',cx,cy,24,{rotate:90,  fill:'#8b5cf6'}), (cx,cy)=>shape('arrow',cx,cy,24,{rotate:180, fill:'#14b8a6'}), (cx,cy)=>shape('arrow',cx,cy,24,{rotate:270, fill:'#f97316'}),
      (cx,cy)=>shape('arrow',cx,cy,24,{rotate:180, fill:'#14b8a6'}), (cx,cy)=>shape('arrow',cx,cy,24,{rotate:270, fill:'#f97316'}), '?'
    ]),
  'p11': () => numberSeriesFigure([1, 1, 2, 3, 5, 8, 13, null]),
  'p12': () => numberSeriesFigure([2, 5, 11, 23, 47, 95, null]),
  'p13': () => dominoSequenceFigure([
      [0, 6],
      [1, 5],
      [2, 4],
      [3, 3],
      [4, 2],
      null
    ]),
  'p14': () => dominoSequenceFigure([
      [0, 1],
      [2, 3],
      [3, 4],
      [5, 6],
      [6, 0],
      null
    ]),
  'p15': () => dominoSequenceFigure([
      [0, 6],
      [2, 5],
      [4, 4],
      [6, 3],
      [1, 2],
      null
    ]),
  'p16': () => dominoSequenceFigure([
      [1, 1],
      [2, 3],
      [3, 6],
      [4, 3],
      [5, 1],
      null
    ]),
  'p17': () => dominoSequenceFigure([
      [6, 6],
      [4, 4],
      [2, 2],
      [0, 0],
      [5, 5],
      null
    ]),
  's1': () => {
      const size = 140;
      return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" class="matrix-svg">
        <text x="${size/2}" y="18" text-anchor="middle" font-size="12" fill="#6b7280" font-weight="600">TARGET</text>
        <polygon points="40,40 100,40 100,60 60,60 60,100 40,100" fill="#2563eb"/>
      </svg>`;
    },
  's2': () => {
      const size = 140;
      return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" class="matrix-svg">
        <text x="${size/2}" y="18" text-anchor="middle" font-size="12" fill="#6b7280" font-weight="600">TARGET</text>
        <polygon points="55,42 90,42 90,48 62,48 62,62 82,62 82,68 62,68 62,102 55,102" fill="#10b981"/>
      </svg>`;
    },
  's5': () => {
      const size = 140;
      return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" class="matrix-svg">
        <text x="${size/2}" y="18" text-anchor="middle" font-size="12" fill="#6b7280" font-weight="600">TARGET</text>
        <polygon points="45,35 65,35 65,85 115,85 115,105 45,105" fill="#f97316"/>
      </svg>`;
    },
  's6': () => {
      const size = 200;
      return `<svg width="${size+60}" height="${size*0.7}" viewBox="0 0 ${size+60} ${size*0.7}" xmlns="http://www.w3.org/2000/svg" class="matrix-svg">
        <rect x="20" y="20" width="80" height="80" fill="#fff" stroke="#1f2937" stroke-width="2"/>
        <line x1="60" y1="20" x2="60" y2="100" stroke="#6b7280" stroke-width="1.5" stroke-dasharray="4 3"/>
        <line x1="20" y1="60" x2="100" y2="60" stroke="#6b7280" stroke-width="1.5" stroke-dasharray="4 3"/>
        <line x1="40" y1="20" x2="40" y2="100" stroke="#6b7280" stroke-width="1.5" stroke-dasharray="4 3"/>
        <text x="60" y="125" text-anchor="middle" font-size="11" fill="#6b7280" font-weight="600">FOLD THREE TIMES</text>
        <path d="M 115 60 L 145 60" stroke="#1f2937" stroke-width="2" fill="none" marker-end="url(#arr3)"/>
        <defs><marker id="arr3" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#1f2937"/></marker></defs>
        <rect x="160" y="70" width="40" height="40" fill="#fff" stroke="#1f2937" stroke-width="2"/>
        <circle cx="175" cy="85" r="3.5" fill="#1f2937"/>
        <text x="180" y="125" text-anchor="middle" font-size="11" fill="#6b7280" font-weight="600">PUNCH ONE HOLE</text>
      </svg>`;
    },
  'n3': () => tableSvg(
      ['Company','Employees','Managers','Ratio'],
      [
        ['A','400','20','—'],
        ['B','600','25','—']
      ]
    ),
  'n4': () => barChartSvg(['Q1','Q2','Q3','Q4','Q5'], [80, 95, 60, 100, 120], 2),
  'n5': () => tableSvg(
      ['Product','Revenue','Margin'],
      [
        ['P1','$1,000','10%'],
        ['P2','$800','15%'],
        ['P3','$500','20%'],
        ['P4','$300','25%']
      ]
    ),
  'n7': () => barChartSvg(['Q1','Q2','Q3','Q4'], [45, 72, 58, 90], 3),
  'n11': () => barChartSvg(['Q1','Q2','Q3','Q4'], [100, 150, 130, 180], 3)
};

module.exports = {
  render(id) {
    const fn = figureMap[id];
    return fn ? fn() : null;
  },
  hasFigure(id) {
    return typeof figureMap[id] === 'function';
  },
  figureIds() {
    return Object.keys(figureMap);
  }
};
