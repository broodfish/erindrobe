const ENTITY_REPLACEMENTS = [
  [/&amp;/g, '&'],
  [/&#39;/g, "'"],
  [/&quot;/g, '"'],
  [/&nbsp;/g, ' '],
];

function decodeEntities(value) {
  let text = String(value ?? '');
  for (const [pattern, replacement] of ENTITY_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

function normalizeName(value) {
  return decodeEntities(value)
    .normalize('NFKC')
    .replace(/^(?:\(?(?:수정|추가)\)?|\(?(?:修改|追加)\)?)/u, '')
    .replace(/[^\p{Letter}\p{Number}]/gu, '');
}

function deriveTwStatus({ nameMatch = false, imageMatch = false, manualMatch = false } = {}) {
  if (manualMatch || (nameMatch && imageMatch)) return 'confirmed';
  if (nameMatch) return 'probable';
  return 'unmatched';
}

function createEvidence({ krId, krName, twThreadId, twName, twDate, twDateSource, twSaleDateText, method, note } = {}) {
  const evidence = {};
  if (krId != null) evidence.krId = String(krId);
  if (krName) evidence.krName = krName;
  if (twThreadId != null) evidence.twThreadId = String(twThreadId);
  if (twName) evidence.twName = twName;
  if (twDate != null) evidence.twDate = twDate;
  if (twDateSource) evidence.twDateSource = twDateSource;
  if (twSaleDateText) evidence.twSaleDateText = twSaleDateText;
  if (method) evidence.method = method;
  if (note) evidence.note = note;
  return evidence;
}

function mergeMatchEvidence(base = {}, evidence) {
  const result = {
    ...base,
    twEvidence: [...(base.twEvidence || [])],
  };
  if (evidence && Object.keys(evidence).length > 0) result.twEvidence.push(evidence);
  return result;
}

module.exports = {
  decodeEntities,
  normalizeName,
  deriveTwStatus,
  createEvidence,
  mergeMatchEvidence,
};
