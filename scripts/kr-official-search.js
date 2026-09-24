// Pure helpers for the Korean official site's /Search/GetList response.
// The live request is intentionally kept in scrape-kr-search.js so these rules can be tested
// without a Korean exit node or a network connection.

const BOARD_QUERIES = [
  { boardId: '4557', boardPath: '/News/Notice' },
  { boardId: '4558', boardPath: '/News/Events' },
  { boardId: '4559', boardPath: '/News/Update' },
];

const SEARCH_KEYWORDS = [
  '전설 패션',
  '토탈 패키지',
  '패션 럭키박스',
  '펫 럭키박스',
  '모험가 프리미엄 패스',
  '시즌 패스',
  '컬렉션 백',
  '패션샵',
  '패션 상점',
  '신규 상품',
  '악기 선택 상자',
  '악기',
  '염색약 선택 상자',
  '헤어',
  '헤어스타일',
  '신규 외형',
  '미리보기',
  '콜라보 상품',
  '콜라보',
  '컬래버',
  '행운 상자',
  '선택 상자',
];

function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

function stripMarkup(value) {
  return decodeEntities(String(value || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function attr(block, name) {
  const re = new RegExp(`${name}=["']([^"']*)["']`, 'i');
  const match = String(block || '').match(re);
  return match ? decodeEntities(match[1]) : null;
}

function parseOfficialSearchResults(html, matchedKeyword = '') {
  const source = String(html || '');
  const totalMatch = source.match(/class=["']result_count[\s\S]*?<b>(\d+)<\/b>/i)
    || source.match(/data-totalcount=["'](\d+)["']/i);
  const pagingMatch = source.match(/<[^>]*data-mm-paging[^>]*>/i);
  const paging = pagingMatch ? pagingMatch[0] : '';
  const blockStartNo = attr(paging, 'data-blockstartno') || '1';
  const blockStartKey = attr(paging, 'data-blockstartkey') || '';
  const totalcount = totalMatch ? Number(totalMatch[1]) : null;
  const items = [];
  const liRe = /<li\s+class=["']item[^"']*["'][\s\S]*?data-threadid=["'](\d+)["'][\s\S]*?<\/li>\s*(?=<li\s+class=["']item|<\/ul>)/gi;
  let match;
  while ((match = liRe.exec(source))) {
    const id = match[1];
    const block = match[0];
    const titleMatch = block.match(/<a\b[^>]*class=["']title[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const dateMatch = block.match(/class=["']date["'][\s\S]*?<span>(\d{4}\.\d{2}\.\d{2})<\/span>/i)
      || block.match(/\b(\d{4}\.\d{2}\.\d{2})\b/);
    const typeMatch = block.match(/class=["']type["']>([\s\S]*?)<\/div>/i);
    const categories = typeMatch
      ? [...typeMatch[1].matchAll(/<span>([^<]*)<\/span>/gi)].map(item => stripMarkup(item[1]))
      : [];
    const titleLinkMatch = block.match(/<a\b[^>]*class=["']title[^"']*["'][^>]*>/i);
    const titleLink = titleLinkMatch ? titleLinkMatch[0] : '';
    const boardPath = attr(titleLink, 'data-boardactionpath') || (() => {
      const href = attr(titleLink, 'href');
      const pathMatch = href && href.match(/^(\/News\/(?:Notice|Events|Update))/u);
      return pathMatch ? pathMatch[1] : null;
    })();
    items.push({
      id,
      title: stripMarkup(titleMatch[1]),
      date: dateMatch ? dateMatch[1] : null,
      categories,
      boardPath,
      url: boardPath ? `https://mabinogimobile.nexon.com${boardPath}/${id}` : null,
      matchedKeywords: matchedKeyword ? [matchedKeyword] : [],
      source: 'official-search',
    });
  }
  return { totalcount, items, blockStartNo, blockStartKey };
}

function buildSearchQueries() {
  return BOARD_QUERIES.flatMap(board => SEARCH_KEYWORDS.map(keywords => ({
    ...board,
    keywords,
    searchkeywordtype: 'THREAD_TITLE_AND_CONTENT',
  })));
}

function buildSearchForm(query, page = 1, paging = {}) {
  const params = new URLSearchParams({
    pageno: String(page),
    keywords: query.keywords,
    boardid: query.boardId,
    headlineId: '',
    searchkeywordtype: query.searchkeywordtype || 'THREAD_TITLE_AND_CONTENT',
  });
  if (page > 1) {
    params.set('blockStartNo', String(paging.blockStartNo || '0'));
    params.set('blockStartKey', String(paging.blockStartKey || ''));
  }
  return params;
}

module.exports = {
  BOARD_QUERIES,
  SEARCH_KEYWORDS,
  buildSearchForm,
  buildSearchQueries,
  parseOfficialSearchResults,
  stripMarkup,
};
