// Filter the merged KR notice/event lists down to fashion-related candidates by keyword.
const fs = require('fs');
const path = require('path');

const RAW = path.join(__dirname, '..', 'data', 'raw');
const KW = ['패션', '코스튬', '럭키박스', '럭키 박스', '시즌패스', '시즌 패스', '통행증', '컬렉션', '앙상블', '스타일러', '염색', '헤어', '악세서리', '액세서리', '탈것', '마운트', '펫 스킨', '의상', '콜라보', '컬래버', '시적'];

function load(f) {
  return JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
}
function dedupe(items) {
  const m = new Map();
  for (const i of items) if (!m.has(i.id)) m.set(i.id, i);
  return [...m.values()];
}
function filt(items) {
  return items.filter(i => i.title && KW.some(kw => i.title.includes(kw)));
}

const notice = dedupe([...load('kr-notice-info.json'), ...load('kr-notice-done.json'), ...load('kr-notice-major.json')]);
const events = dedupe([...load('kr-events-past.json'), ...load('kr-events-all.json')]);

fs.writeFileSync(path.join(RAW, 'kr-notice-merged.json'), JSON.stringify(notice, null, 2));
fs.writeFileSync(path.join(RAW, 'kr-events-merged.json'), JSON.stringify(events, null, 2));

const candidates = { notice: filt(notice), events: filt(events) };
fs.writeFileSync(path.join(RAW, 'kr-candidates.json'), JSON.stringify(candidates, null, 2));
console.log('notice candidates:', candidates.notice.length, '/ events candidates:', candidates.events.length);
