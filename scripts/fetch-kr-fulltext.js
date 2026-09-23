// Fetch full (untruncated) page text for a list of KR notice IDs and merge into kr-details.json.
// Unlike scrape-kr-details.js (which grabs contentImages + a 4000-char textPreview for vision
// extraction), this grabs the complete text body so scripts/parse-kr-text.js can read structured
// "[상품명]" listings and 판매 기간 date ranges directly — the notice text is the authoritative
// source; images are only needed as a display asset, not for name/date extraction.
const fs = require('fs');
const path = require('path');
const { validateRecords, writeJsonAtomically } = require('./validate-raw-data.js');

const BASE = 'https://mabinogimobile.nexon.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchFullText(id, boardPath) {
  const url = `${BASE}${boardPath}/${id}`;
  const resp = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const html = await resp.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  const marker = text.indexOf('차단한 게시글 입니다.');
  const body = marker >= 0 ? text.slice(marker + '차단한 게시글 입니다.'.length).trim() : text;

  const imgs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map(m => m[1]);
  const CHROME_BLOCKLIST = [
    '관리자프로필이미지', '상단배너', '게시글하단푸터', '공식홈페이지플로팅배너',
    '상점안내', '프로필이미지', 'default', 'favicon', 'banner108x241', '푸터',
  ];
  const contentImages = [...new Set(imgs.filter(u => {
    const d = decodeURIComponent(u);
    return d.includes('cloudfront.net/community/') && !CHROME_BLOCKLIST.some(b => d.includes(b));
  }))];

  const titleM = html.match(/<title>([^<]+)<\/title>/);
  const dateM = text.match(/(\d{4}\.\d{2}\.\d{2}\s+\d{2}:\d{2})/);

  return { fullText: body, contentImages, pageTitle: titleM ? titleM[1].trim() : null, exactDate: dateM ? dateM[1] : null };
}

(async () => {
  const ids = process.argv.slice(2);
  if (!ids.length) {
    console.error('Usage: node fetch-kr-fulltext.js <id1> <id2> ...');
    process.exit(1);
  }
  const detailsPath = path.join(__dirname, '..', 'data', 'raw', 'kr-details.json');
  const details = JSON.parse(fs.readFileSync(detailsPath, 'utf8'));
  const byId = new Map(details.map(d => [d.id, d]));

  const eventIds = new Set(
    JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'raw', 'kr-events-merged.json'), 'utf8')).map(e => e.id)
  );

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const boardPath = eventIds.has(id) ? '/News/Events' : '/News/Notice';
    try {
      const info = await fetchFullText(id, boardPath);
      const existing = byId.get(id) || { id, url: `${BASE}${boardPath}/${id}` };
      Object.assign(existing, info);
      byId.set(id, existing);
      process.stdout.write(`\r[${i + 1}/${ids.length}] ${id} (${boardPath}) textLen=${info.fullText.length} imgs=${info.contentImages.length}`.padEnd(80));
    } catch (e) {
      console.error(`\nFailed ${id}:`, e.message);
    }
    await new Promise(r => setTimeout(r, 200));
  }
  console.log('');
  const merged = [...byId.values()];
  const validation = validateRecords(merged, {
    label: 'kr-details',
    requiredFields: ['id'],
    requireNonEmpty: ['fullText'],
    minCount: 1,
  });
  if (!validation.ok) {
    console.error('Refusing to overwrite kr-details.json:');
    validation.errors.forEach(error => console.error(`  - ${error}`));
    process.exitCode = 1;
    return;
  }
  writeJsonAtomically(detailsPath, merged);
  console.log('DONE, kr-details.json now has', byId.size, 'entries');
})();
