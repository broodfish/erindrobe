// Parse structured item names + sale dates directly from KR notice body text, instead of
// vision-reading promotional banner images. The notice text already contains the authoritative
// official names (e.g. "정열의 춤 : 패션 럭키박스") in a "✨ NAME" section-header pattern, each
// followed by a "분류/구성품" item table — far more reliable than OCR-style image reading, which
// previously invented plausible-but-wrong names like "정열의 춤: 카르메나 세트" (the real box name
// is "정열의 춤"; "카르메나" is just the equipment set's internal prefix, not the box title).
const fs = require('fs');
const path = require('path');

const kr = require(path.join(__dirname, '..', 'data', 'raw', 'kr-details.json'));

function parseDateRange(text) {
  const m = text.match(/판매\s*기간\s*[:：]\s*(\d{4})\s*년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}.${mo.padStart(2, '0')}.${d.padStart(2, '0')}`;
}

function parseTotalPackageName(text) {
  if (!text) return null;
  const normalized = String(text).replace(/\s+/g, ' ').trim();
  const patterns = [
    /✨\s*([^✨]{2,24}?)\s*토탈\s*패키지/u,
    /(?:^|\s)([가-힣A-Za-z0-9][가-힣A-Za-z0-9\s·&-]{1,24}?)\s*토탈\s*패키지/u,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      const name = match[1].trim().replace(/^(?:종합\s*안내|안내)\s*/u, '');
      if (name) return name;
    }
  }
  return null;
}

function parseDateFromContext(text) {
  const m = String(text || '').match(/(\d{4})\s*년\s*(\d{1,2})월\s*(\d{1,2})일|\b(\d{4})[./](\d{1,2})[./](\d{1,2})\b/u);
  if (!m) return null;
  const year = m[1] || m[4];
  const month = m[2] || m[5];
  const day = m[3] || m[6];
  return `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
}

function parseChoiceBoxes(text) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  if (!source) return [];
  const matches = [];

  const dyeRe = /염색약\s*선택\s*상자\s*[:：]\s*([^\d]{1,30}?)\s*지정\s*염색약\s*\(([^)]{1,80})\)/gu;
  let match;
  while ((match = dyeRe.exec(source))) {
    matches.push({
      index: match.index,
      name: `염색약 선택 상자: ${match[1].trim()}`,
      kind: 'dye',
      saleDate: parseDateFromContext(source),
      componentsText: match[2].trim(),
    });
  }

  const instrumentRe = /(?:^|[.!?。！？])\s*([^.!?。！？◼]{1,30}?)\s*악기\s*선택\s*상자\s*◼\s*판매\s*기간/gu;
  const instrumentMatches = [...source.matchAll(instrumentRe)];
  instrumentMatches.forEach((item, index) => {
    const next = instrumentMatches[index + 1];
    const contentStart = item.index + item[0].length;
    const contentEnd = next ? next.index : Math.min(source.length, contentStart + 220);
    matches.push({
      index: item.index,
      name: `${item[1].trim()} 악기 선택 상자`,
      kind: 'instrument',
      saleDate: parseDateFromContext(source),
      componentsText: source.slice(contentStart, contentEnd).trim(),
    });
  });

  const seen = new Set();
  return matches
    .sort((a, b) => a.index - b.index)
    .filter((item) => {
      if (seen.has(item.name)) return false;
      seen.add(item.name);
      return true;
    })
    .map(({ index, ...item }) => item);
}

// Split a lucky-box notice's text into per-box sections and extract each box's official name +
// the item-list's common name prefix (the actual equipment set name, e.g. "카르메나").
function parseLuckyBoxNotice(text) {
  const results = [];
  // Section markers: "패션 럭키박스" / "펫 럭키박스" blocks, each with one shared 판매 기간
  // covering every ✨-prefixed box title inside it until the next section marker.
  const sectionRe = /(패\s*션\s*럭키\s*박스|펫\s*럭키\s*박스)\s*◼\s*판매\s*기간\s*[:：]\s*(\d{4})\s*년\s*(\d{1,2})월\s*(\d{1,2})일/g;
  const sections = [];
  let m;
  while ((m = sectionRe.exec(text))) {
    sections.push({ start: m.index, kind: m[1].replace(/\s+/g, ''), date: `${m[2]}.${m[3].padStart(2, '0')}.${m[4].padStart(2, '0')}` });
  }
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    const end = i + 1 < sections.length ? sections[i + 1].start : text.length;
    const chunk = text.slice(sec.start, end);
    // Box-title headers are prefixed by a themed emoji (✨ for fashion, but pet boxes use varied
    // animal emoji like 🐷/🐺/🦉), so match on any pictographic-symbol prefix rather than a fixed
    // emoji, capturing the short name phrase immediately before the distinctive
    // ": 패션 럭키박스"/": 펫 럭키박스" suffix.
    // Exclude U+25A0-25FF (geometric shapes, e.g. ◼) — notices use that as a generic bullet for
    // "◼ 판매 기간" etc., which is also Extended_Pictographic and would otherwise swallow
    // unrelated preceding text into the capture.
    const boxRe = /(?![■-◿])\p{Extended_Pictographic}\s*\[?\s*([^\[\]\n:]{1,20}?)\s*:\s*(패\s*션\s*럭키\s*박스|펫\s*럭키\s*박스)\s*\]?/gu;
    let bm;
    while ((bm = boxRe.exec(chunk))) {
      const boxName = bm[1].replace(/^[^\p{L}\p{N}]+/u, '').trim();
      const boxType = bm[2].replace(/\s+/g, '');
      // Grab the item-list chunk between this box header and the next one (or chunk end) to find
      // the equipment set's common name prefix, e.g. repeated "봄바람 스포츠 ..." -> "봄바람 스포츠".
      const afterIdx = bm.index + bm[0].length;
      const nextBoxM = boxRe.exec(chunk);
      const itemChunkEnd = nextBoxM ? nextBoxM.index : chunk.length;
      boxRe.lastIndex = nextBoxM ? nextBoxM.index : boxRe.lastIndex; // rewind so outer loop still sees it
      const itemChunk = chunk.slice(afterIdx, itemChunkEnd);
      const setNameM = itemChunk.match(/패션\s*장비\s*\(\s*4\s*종\s*\)\s*([^\d(]{2,20}?)(?:캡|햇|페도라|후드|모자)/);
      results.push({
        boxName,
        boxType,
        date: sec.date,
        setNamePrefix: setNameM ? setNameM[1].trim() : null,
      });
      if (!nextBoxM) break;
    }
  }
  return results;
}

if (require.main === module) {
  const testIds = process.argv.slice(2);
  const ids = testIds.length ? testIds : ['2839212', '2906352', '3037067', '3201524', '2957846'];
  ids.forEach(id => {
    const r = kr.find(x => x.id === id);
    if (!r || !r.fullText) { console.log(id, 'NO DATA'); return; }
    console.log('===', id, r.pageTitle);
    console.log(JSON.stringify(parseLuckyBoxNotice(r.fullText), null, 2));
  });
}

module.exports = {
  parseLuckyBoxNotice,
  parseDateRange,
  parseTotalPackageName,
  parseChoiceBoxes,
};
