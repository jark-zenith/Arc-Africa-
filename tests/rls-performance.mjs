import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const sql = readFileSync(new URL('../supabase/migrations/202611100003_query_performance.sql', import.meta.url), 'utf8');

const indexes = [
  'project_comments_author_id_idx',
  'project_favorites_user_id_idx',
  'project_milestones_project_id_idx',
  'project_ratings_user_id_idx',
  'project_updates_author_id_idx',
  'projects_reviewed_by_idx'
];
for (const name of indexes) {
  assert.match(sql, new RegExp('create index if not exists ' + name + '\\b', 'i'), 'missing foreign-key index: ' + name);
}

const policies = [
  'Users update own profile',
  'Public sees approved projects',
  'Members submit projects',
  'Owners edit unapproved projects',
  'Moderators review projects',
  'Milestones visible for public projects',
  'Project owners manage milestones',
  'Updates visible for public projects',
  'Owners and moderators publish updates',
  'Signed in users comment on public projects',
  'Users delete own comments',
  'Users rate public projects',
  'Users update own ratings',
  'Users view own favourites',
  'Users favourite public projects',
  'Users remove own favourites'
];

const statements = [...sql.matchAll(/create policy[\\s\\S]*?;/gi)].map(match => match[0]);
assert.equal(statements.length, policies.length, 'expected every existing application policy to be recreated exactly once');
for (const name of policies) {
  assert.ok(sql.includes('drop policy if exists "' + name + '"'), 'missing policy replacement drop: ' + name);
  assert.ok(sql.includes('create policy "' + name + '"'), 'missing policy replacement create: ' + name);
}
for (const statement of statements) {
  assert.doesNotMatch(statement, /(?<!select )auth\\.uid\\(\\)/i, 'auth.uid() must be wrapped in a scalar SELECT');
  assert.doesNotMatch(statement, /(?<!select )private\\.is_moderator\\(\\)/i, 'moderator helper must be wrapped in a scalar SELECT');
}

// Preserve the privacy gates: only approved projects are public; owners and moderators retain their scoped access.
assert.match(sql, /status = 'approved'/i);
assert.match(sql, /status in \\('pending', 'changes_requested'\\)/i);
console.log('Arc Africa query-performance migration checks passed.');
