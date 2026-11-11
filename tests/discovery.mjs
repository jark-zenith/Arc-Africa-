import assert from 'node:assert/strict';
import { filterProjects, getCountryOptions } from '../discovery.mjs';

const projects = [
  { id: 'solar', title: 'Solar Micro-grid', summary: 'Reliable power for remote communities', description: 'Community-led mini grids for underserved areas', category: 'Climate & Energy', country: 'Kenya', location: 'Kitui', stage: 'pilot', tags: ['renewable', 'battery storage'] },
  { id: 'learning', title: 'Open Learning Hub', summary: 'Digital learning for young builders', description: 'AI-assisted coding lessons and open courses', category: 'Education', country: 'Uganda', location: 'Kampala', stage: 'prototype', tags: ['education', 'AI'] },
  { id: 'health', title: 'Mobile Health', summary: 'Local access to health guidance', description: 'A community telehealth service', category: 'Health', country: ' Kenya ', location: 'Nairobi', stage: 'launched', tags: ['telehealth'] }
];

assert.deepEqual(filterProjects(projects, { query: 'battery renewable' }).map(p => p.id), ['solar']);
assert.deepEqual(filterProjects(projects, { query: 'coding lessons' }).map(p => p.id), ['learning']);
assert.deepEqual(filterProjects(projects, { query: 'kampala' }).map(p => p.id), ['learning']);
assert.deepEqual(filterProjects(projects, { query: 'SOLAR kenya' }).map(p => p.id), ['solar']);
assert.deepEqual(filterProjects(projects, { category: 'education' }).map(p => p.id), ['learning']);
assert.deepEqual(filterProjects(projects, { stage: 'PILOT' }).map(p => p.id), ['solar']);
assert.deepEqual(filterProjects(projects, { country: 'kenya' }).map(p => p.id), ['solar', 'health']);
assert.deepEqual(filterProjects(projects, { category: 'Climate & Energy', stage: 'pilot', country: 'Kenya', query: 'remote battery' }).map(p => p.id), ['solar']);
assert.equal(filterProjects(projects, { query: 'not-a-real-project' }).length, 0);
assert.equal(filterProjects(projects, { query: '   ' }).length, 3);
assert.deepEqual(getCountryOptions(projects), ['Kenya', 'Uganda']);
assert.deepEqual(filterProjects(null), []);
assert.deepEqual(getCountryOptions(null), []);

console.log('Arc Africa discovery checks passed.');
