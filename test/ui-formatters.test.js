const test = require('node:test');
const assert = require('node:assert/strict');
const { formatRerunNote } = require('../js/ui-formatters.js');

test('formats a readable rerun note with the first release date', () => {
  assert.equal(
    formatRerunNote({ isRerun: true, firstReleaseDate: '2025.04.24' }),
    '復刻／再販 · 首次推出：2025.04.24',
  );
});

test('does not add rerun copy to an original release', () => {
  assert.equal(formatRerunNote({ isRerun: false, firstReleaseDate: '2025.04.24' }), '');
});
