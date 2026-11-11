const normalize = value => String(value ?? '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .trim();

export function filterProjects(items, filters = {}) {
  const queryTokens = normalize(filters.query).split(/\s+/).filter(Boolean);
  const category = normalize(filters.category);
  const stage = normalize(filters.stage);
  const country = normalize(filters.country);

  return (Array.isArray(items) ? items : []).filter(project => {
    if (category && normalize(project?.category) !== category) return false;
    if (stage && normalize(project?.stage) !== stage) return false;
    if (country && normalize(project?.country) !== country) return false;

    if (!queryTokens.length) return true;
    const searchableText = [
      project?.title,
      project?.summary,
      project?.description,
      project?.category,
      project?.country,
      project?.location,
      ...(Array.isArray(project?.tags) ? project.tags : [])
    ].map(normalize).filter(Boolean).join(' ');

    return queryTokens.every(token => searchableText.includes(token));
  });
}

export function getCountryOptions(items = []) {
  const countries = new Map();
  for (const project of Array.isArray(items) ? items : []) {
    const country = String(project?.country ?? '').trim();
    const key = normalize(country);
    if (key && !countries.has(key)) countries.set(key, country);
  }
  return [...countries.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}
