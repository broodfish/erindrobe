const fs = require('fs');
const path = require('path');

function validateRecords(records, {
  label = 'records',
  requiredFields = ['id'],
  requireNonEmpty = [],
  minCount = 1,
} = {}) {
  const errors = [];
  if (!Array.isArray(records)) {
    return { ok: false, count: 0, errors: [`${label} must be an array`] };
  }
  if (records.length < minCount) {
    errors.push(`${label} has ${records.length} records; expected at least ${minCount}`);
  }

  const seen = new Set();
  records.forEach((record, index) => {
    const number = index + 1;
    if (!record || typeof record !== 'object') {
      errors.push(`${label} record ${number} is not an object`);
      return;
    }
    for (const field of requiredFields) {
      if (record[field] === undefined || record[field] === null || record[field] === '') {
        errors.push(`${label} record ${number} missing ${field}`);
      }
    }
    for (const field of requireNonEmpty) {
      if (typeof record[field] !== 'string' || !record[field].trim()) {
        errors.push(`${label} record ${number} missing ${field}`);
      }
    }
    if (record.id !== undefined && record.id !== null && record.id !== '') {
      const id = String(record.id);
      if (seen.has(id)) errors.push(`${label} duplicate id ${id}`);
      seen.add(id);
    }
  });

  return { ok: errors.length === 0, count: records.length, errors };
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validateFile(filePath, options) {
  const records = loadJson(filePath);
  return validateRecords(records, options);
}

function writeJsonAtomically(filePath, value) {
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2));
  fs.renameSync(tempPath, filePath);
}

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const files = [
    ['kr-notice-merged.json', { requiredFields: ['id', 'title', 'date'], minCount: 1 }],
    ['kr-events-merged.json', { requiredFields: ['id', 'title'], minCount: 1 }],
    ['kr-details.json', { requiredFields: ['id'], requireNonEmpty: ['fullText'], minCount: 1 }],
    ['tw-details.json', { requiredFields: ['threadId', 'title'], minCount: 1 }],
  ];
  let failed = false;
  for (const [name, options] of files) {
    const filePath = path.join(root, 'data', 'raw', name);
    const result = validateFile(filePath, { label: name, ...options });
    if (result.ok) {
      console.log(`[ok] ${name}: ${result.count}`);
    } else {
      failed = true;
      console.error(`[invalid] ${name}`);
      result.errors.forEach(error => console.error(`  - ${error}`));
    }
  }
  if (failed) process.exitCode = 1;
}

module.exports = { validateRecords, validateFile, writeJsonAtomically };
