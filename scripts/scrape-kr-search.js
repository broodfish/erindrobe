// Discover Korean official notices through the site's own "title + content" search endpoint.
// Run this after scrape:kr-lists and before filter:kr-candidates.
const fs = require('fs');
const path = require('path');
const { buildSearchForm, buildSearchQueries, parseOfficialSearchResults } = require('./kr-official-search.js');
const { writeJsonAtomically } = require('./validate-raw-data.js');

const BASE = 'https://mabinogimobile.nexon.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_PAGES_PER_QUERY = 30;

function responseCookies(response) {
  if (typeof response.headers.getSetCookie === 'function') return response.headers.getSetCookie();
  const raw = response.headers.get('set-cookie');
  return raw ? raw.split(/,(?=[^;]+=[^;]+)/u) : [];
}

function mergeCookies(cookieHeader, response) {
  const cookies = new Map();
  for (const part of String(cookieHeader || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key && rest.length) cookies.set(key, rest.join('='));
  }
  for (const setCookie of responseCookies(response)) {
    const [pair] = setCookie.split(';');
    const [key, ...rest] = pair.trim().split('=');
    if (key && rest.length) cookies.set(key, rest.join('='));
  }
  return [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
}

async function fetchWithSession(url, options, cookieHeader) {
  const headers = { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9', ...options.headers };
  if (cookieHeader) headers.Cookie = cookieHeader;
  const response = await fetch(url, { ...options, headers });
  return { response, cookieHeader: mergeCookies(cookieHeader, response) };
}

async function searchOne(query, cookieHeader) {
  let sessionCookie = cookieHeader;
  const first = await fetchWithSession(`${BASE}/Search`, { headers: { Accept: 'text/html' } }, sessionCookie);
  sessionCookie = first.cookieHeader;
  if (!first.response.ok) throw new Error(`GET /Search HTTP ${first.response.status}`);

  const results = [];
  let page = 1;
  let paging = {};
  let totalcount = null;
  while (page <= MAX_PAGES_PER_QUERY) {
    const body = buildSearchForm(query, page, paging).toString();
    const result = await fetchWithSession(`${BASE}/Search/GetList`, {
      method: 'POST',
      headers: {
        Accept: 'text/html, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Origin: BASE,
        Referer: `${BASE}/Search`,
      },
      body,
    }, sessionCookie);
    sessionCookie = result.cookieHeader;
    const html = await result.response.text();
    if (!result.response.ok || /<title>[^<]*(?:에러|오류|마비노기 모바일)[^<]*<\/title>/iu.test(html) && !html.includes('result_count')) {
      throw new Error(`POST /Search/GetList HTTP ${result.response.status}`);
    }
    const parsed = parseOfficialSearchResults(html, query.keywords);
    if (!parsed.items.length && page === 1 && parsed.totalcount) throw new Error('official search returned no parseable items');
    results.push(...parsed.items.map(item => ({ ...item, searchBoardId: query.boardId })));
    totalcount = parsed.totalcount ?? totalcount;
    paging = parsed;
    const perPage = parsed.items.length;
    if (!perPage || !totalcount || results.length >= totalcount) break;
    page += 1;
    await new Promise(resolve => setTimeout(resolve, 180));
  }
  return { items: results, totalcount, pages: page };
}

function dedupe(items) {
  const byId = new Map();
  for (const item of items) {
    const key = `${item.boardPath || ''}:${item.id}`;
    const previous = byId.get(key);
    if (!previous) byId.set(key, item);
    else previous.matchedKeywords = [...new Set([...(previous.matchedKeywords || []), ...(item.matchedKeywords || [])])];
  }
  return [...byId.values()];
}

async function main() {
  const all = [];
  let failed = 0;
  for (const query of buildSearchQueries()) {
    try {
      const result = await searchOne(query, '');
      all.push(...result.items);
      console.log(`[${query.boardPath}] ${query.keywords}: ${result.items.length}/${result.totalcount ?? '?'} results`);
    } catch (error) {
      failed += 1;
      console.error(`[${query.boardPath}] ${query.keywords}: ${error.message}`);
    }
  }
  const records = dedupe(all);
  if (!records.length) {
    console.error('Official search found no records; refusing to overwrite kr-search-results.json.');
    process.exitCode = 1;
    return;
  }
  const outPath = path.join(__dirname, '..', 'data', 'raw', 'kr-search-results.json');
  writeJsonAtomically(outPath, records);
  console.log(`Saved ${records.length} official-search records (${failed} queries failed).`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { dedupe, main, searchOne };
