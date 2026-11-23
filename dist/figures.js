import { setMath } from './math.js';

const width = 640;
const height = 384;
const padding = 18;
const ink = '#503aa0';
const fill = '#f1ebfe';

function label(context, text, x, y, maxWidth = width - 36) {
  if (!text) return;
  const available = Math.max(20, maxWidth);
  const lines = [''];
  for (const character of text.trim()) {
    const last = lines.length - 1;
    if (lines[last] && context.measureText(lines[last] + character).width > available) lines.push(character);
    else lines[last] += character;
  }
  const firstY = y - (lines.length - 1) * 13;
  lines.forEach((line, index) => {
    const ly = Math.max(16, Math.min(height - 16, firstY + index * 26));
    const half = context.measureText(line).width / 2 + 5;
    const lx = Math.max(half, Math.min(width - half, x));
    context.lineWidth = 4;
    context.strokeStyle = '#ffffff';
    context.strokeText(line, lx, ly, available);
    context.fillStyle = '#2a2148';
    context.fillText(line, lx, ly, available);
  });
}

function drawFigure(canvas, items) {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.scale(2, 2);
  context.font = '600 25px Pretendard, system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineCap = 'round';
  context.lineJoin = 'round';
  const px = x => padding + x * (width - 2 * padding) / 100;
  const py = y => padding + y * (height - 2 * padding) / 100;
  const labels = [];

  for (const item of items) {
    const x = px(item.x);
    const y = py(item.y);
    const x2 = px(item.x2);
    const y2 = py(item.y2);
    const middleX = (x + x2) / 2;
    const middleY = (y + y2) / 2;
    const spanX = Math.abs(x2 - x);
    const spanY = Math.abs(y2 - y);
    context.strokeStyle = ink;
    context.fillStyle = fill;
    context.lineWidth = 3;

    if (item.kind === 'line' || item.kind === 'arrow') {
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x2, y2);
      if (item.kind === 'arrow' && Math.hypot(x2 - x, y2 - y) > 3) {
        const angle = Math.atan2(y2 - y, x2 - x);
        for (const edge of [-0.58, 0.58]) {
          context.moveTo(x2, y2);
          context.lineTo(x2 - Math.cos(angle + edge) * 14, y2 - Math.sin(angle + edge) * 14);
        }
      }
      context.stroke();
      labels.push([item.text, middleX, middleY - 16]);
    } else if (item.kind === 'box' || item.kind === 'ellipse') {
      context.beginPath();
      if (item.kind === 'box') context.rect(Math.min(x, x2), Math.min(y, y2), spanX, spanY);
      else context.ellipse(middleX, middleY, spanX / 2, spanY / 2, 0, 0, 2 * Math.PI);
      context.fill();
      context.stroke();
      labels.push([item.text, middleX, middleY, spanX - 12]);
    } else {
      if (item.kind === 'point') {
        context.beginPath();
        context.arc(x, y, 5, 0, 2 * Math.PI);
        context.fillStyle = ink;
        context.fill();
      }
      labels.push([item.text, x, y - (item.kind === 'point' ? 17 : 0)]);
    }
  }
  for (const args of labels) label(context, ...args);
}

export function makeFigure(diagram) {
  if (!diagram?.items?.length) return null;
  const figure = document.createElement('figure');
  figure.className = 'study-figure';
  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  canvas.setAttribute('aria-hidden', 'true');
  drawFigure(canvas, diagram.items);
  const caption = document.createElement('figcaption');
  setMath(caption, diagram.caption);
  figure.append(canvas, caption);
  return figure;
}

export function mountFigure(container, diagram) {
  const figure = makeFigure(diagram);
  container.replaceChildren(...(figure ? [figure] : []));
}
