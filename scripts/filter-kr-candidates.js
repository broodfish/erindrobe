// Merge list results with the Korean site's own title+content search results, then filter down to
// product/event candidates. The official search is important for notices such as "신규 상품 안내"
// whose title does not say "fashion" but whose body contains new hairstyles or preview sections.
const fs = require('fs');
const path = require('path');

const RAW = path.join(__dirname, '..', 'data', 'raw');
const KW = [
  '패션', '코스튬', '럭키박스', '럭키 박스', '행운 상자', '선택 상자',
  '시즌패스', '시즌 패스', '프리미엄 패스', '통행증', '컬렉션', '앙상블',
  '토탈 패키지', '스타일러', '염색', '헤어', '헤어스타일', '신규 외형',
  '미리보기', '악기', '악세서리', '액세서리', '탈것', '마운트', '펫 스킨',
  '의상', '콜라보', '컬래버', '상품 안내', '신규 상품', '패션샵', '시적',
];

function load(f) {
  return JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
}
function loadOptional(f, fallback = []) {
  const filePath = path.join(RAW, f);
  return fs.existsSync(filePath) ? load(f) : fallback;
}
function dedupe(items) {
  const m = new Map();
  for (const i of items) {
    const key = `${i.boardPath || ''}:${i.id}`;
    if (!m.has(key)) m.set(key, i);
    else {
      const previous = m.get(key);
      previous.matchedKeywords = [...new Set([...(previous.matchedKeywords || []), ...(i.matchedKeywords || [])])];
    }
  }
  return [...m.values()];
}
function filt(items) {
  return items.filter(i => i.title && KW.some(kw => i.title.includes(kw)));
}
function withBoardPath(items, boardPath) {
  return items.map(item => ({
    ...item,
    boardPath: item.boardPath || boardPath,
    url: item.url || `https://mabinogimobile.nexon.com${boardPath}/${item.id}`,
  }));
}

const notice = dedupe(withBoardPath([
  ...load('kr-notice-info.json'),
  ...load('kr-notice-done.json'),
  ...load('kr-notice-major.json'),
], '/News/Notice'));
const events = dedupe(withBoardPath([
  ...load('kr-events-past.json'),
  ...load('kr-events-all.json'),
], '/News/Events'));
const update = dedupe(withBoardPath(loadOptional('kr-update.json'), '/News/Update'));
const officialSearch = loadOptional('kr-search-results.json');

fs.writeFileSync(path.join(RAW, 'kr-notice-merged.json'), JSON.stringify(notice, null, 2));
fs.writeFileSync(path.join(RAW, 'kr-events-merged.json'), JSON.stringify(events, null, 2));

const candidates = {
  notice: dedupe([...filt(notice), ...officialSearch.filter(i => i.boardPath === '/News/Notice')]),
  events: dedupe([...filt(events), ...officialSearch.filter(i => i.boardPath === '/News/Events')]),
  update: dedupe([...filt(update), ...officialSearch.filter(i => i.boardPath === '/News/Update')]),
};
fs.writeFileSync(path.join(RAW, 'kr-candidates.json'), JSON.stringify(candidates, null, 2));
console.log(
  'notice candidates:', candidates.notice.length,
  '/ events candidates:', candidates.events.length,
  '/ update candidates:', candidates.update.length,
  '/ official-search records:', officialSearch.length,
);
