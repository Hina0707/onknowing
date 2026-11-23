const delimiters = /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$|(?<![\\$])\$(?![\s$])([^$\r\n]*?[^\s$])(?<!\\)\$(?!\$)|`([^`\r\n]+)`/g;
const bareFormula = /(?<![A-Za-z0-9_\\])(?:[A-Za-z](?:'{1,3})?\([A-Za-z0-9\s.,+\-*/_^{}]{1,32}\)|(?:\d+(?:\.\d+)?)?[A-Za-z0-9](?:\^(?:-?\d+|[A-Za-z]|\{[A-Za-z0-9+\- ]{1,20}\})|_(?:\d+|[A-Za-z]|\{[A-Za-z0-9+\- ]{1,20}\})|[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+))(?![A-Za-z0-9_])/g;
const superscript = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
const renderOptions = { trust: false, strict: 'ignore', throwOnError: true, maxExpand: 240, maxSize: 30 };
let renderer;

function appendBare(parts, text) {
  let offset = 0;
  for (const match of text.matchAll(bareFormula)) {
    if (match.index > offset) parts.push({ type: 'text', text: text.slice(offset, match.index) });
    const source = match[0];
    const formula = source.replace(/([\^_])(-?\d+)/g, '$1{$2}')
      .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, value => '^{' + Array.from(value, char => superscript[char]).join('') + '}');
    parts.push({ type: 'math', formula, source, displayMode: false });
    offset = match.index + source.length;
  }
  if (offset < text.length) parts.push({ type: 'text', text: text.slice(offset) });
}

export function splitMath(value) {
  const text = String(value ?? '');
  const parts = [];
  let offset = 0;
  for (const match of text.matchAll(delimiters)) {
    appendBare(parts, text.slice(offset, match.index));
    if (match[5] !== undefined) {
      parts.push({ type: 'code', text: match[5] });
    } else {
      const formula = match.slice(1, 5).find(value => value !== undefined)?.trim();
      if (formula) {
        parts.push({ type: 'math', formula, source: formula, displayMode: match[1] !== undefined || match[3] !== undefined });
      } else {
        parts.push({ type: 'text', text: match[0] });
      }
    }
    offset = match.index + match[0].length;
  }
  appendBare(parts, text.slice(offset));
  return parts;
}

function loadRenderer() {
  renderer ??= import('./vendor/katex/katex.mjs').then(module => module.default).catch(() => null);
  return renderer;
}

export function setMath(node, value) {
  const parts = splitMath(value);
  const children = parts.map(part => {
    if (part.type === 'text') return document.createTextNode(part.text);
    if (part.type === 'code') {
      const code = document.createElement('code');
      code.textContent = part.text;
      return code;
    }
    const span = document.createElement('span');
    span.className = part.displayMode ? 'study-math study-math-display' : 'study-math';
    span.textContent = part.source;
    if (part.formula.length <= 1600) {
      loadRenderer().then(katex => {
        if (!katex) return;
        try { katex.render(part.formula, span, { ...renderOptions, displayMode: part.displayMode }); }
        catch { span.textContent = part.source; }
      });
    }
    return span;
  });
  node.replaceChildren(...children);
  return node;
}
