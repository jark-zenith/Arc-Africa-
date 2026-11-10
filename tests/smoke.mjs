import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { safeHttpUrl } from '../security.js';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
for (const token of ['Arc Africa','authModal','projectModal','detailModal','discover','config.js']) assert.ok(html.includes(token), 'missing HTML token: '+token);
for (const token of ['signUp','signInWithPassword','resetPasswordForEmail','projects','project_comments','project_ratings','project_favorites','changes_requested','loadModerationQueue']) assert.ok(js.includes(token), 'missing app capability: '+token);
assert.ok(css.includes('@media(max-width:650px)'), 'responsive mobile styles missing');
assert.ok(!/service[_-]?role/i.test(html+js), 'service role key must never be shipped to browser');
console.log('Arc Africa smoke checks passed.');

assert.equal(safeHttpUrl('https://example.com/path?q=1'), 'https://example.com/path?q=1');
assert.equal(safeHttpUrl('http://example.com'), 'http://example.com/');
assert.equal(safeHttpUrl('  https://example.com/path  '), 'https://example.com/path');
for (const value of [
  'javascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  'file:///etc/passwd',
  'ftp://example.com',
  '//example.com/path',
  '/relative/path',
  'not a URL',
  'https://user:pass@example.com',
  'https://example.com' + String.fromCharCode(10) + '.evil',
  '',
  null
]) {
  assert.equal(safeHttpUrl(value), null, 'unsafe URL accepted: ' + String(value));
}
assert.ok(js.includes('safeHttpUrl(p.website_url)'), 'project website links must be scheme-validated');
assert.ok(js.includes('safeHttpUrl(p.repository_url)'), 'repository links must be scheme-validated');
assert.ok(js.includes('rel="noopener noreferrer"'), 'external project links must use safe new-tab rel attributes');
