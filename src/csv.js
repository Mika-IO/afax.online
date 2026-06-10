// Minimal RFC-4180-ish CSV parser (quoted fields, embedded commas/newlines).
// Used by `afax prospect import` for LinkedIn/Apollo/etc. exports. Zero deps.

export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const s = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); field = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

// Map a parsed CSV (header row + data rows) into lead records, recognizing
// common column names from LinkedIn / Apollo / generic exports.
export function csvToLeads(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (...names) => header.findIndex((h) => names.some((n) => h === n || h.includes(n)));
  const iFirst = idx('first name', 'firstname');
  const iLast = idx('last name', 'lastname');
  // exact only — "first name"/"last name" must not match here
  const iName = header.findIndex((h) => h === 'full name' || h === 'name');
  const iEmail = idx('email');
  const iCompany = idx('company', 'organization', 'account');
  const iTitle = idx('position', 'title', 'job');
  return rows.slice(1).map((r) => {
    const name =
      (iName >= 0 && r[iName]?.trim()) ||
      [iFirst >= 0 ? r[iFirst] : '', iLast >= 0 ? r[iLast] : ''].join(' ').trim();
    return {
      name: name || (iEmail >= 0 ? String(r[iEmail]).split('@')[0] : 'Unknown'),
      email: iEmail >= 0 ? String(r[iEmail]).trim() : '',
      company: iCompany >= 0 ? String(r[iCompany]).trim() : '',
      title: iTitle >= 0 ? String(r[iTitle]).trim() : '',
      score: 50,
      signal: 'imported',
    };
  }).filter((l) => l.name || l.email);
}
