// Real lead sourcing / enrichment via Hunter.io.
// Returns verified business emails for a domain. Requires HUNTER_API_KEY.
import { integration } from '../config.js';
import { http } from './http.js';

export function status() {
  const l = integration('leads');
  return { connected: !!l.apiKey, driver: l.driver };
}

// Find real contacts at a company domain (Hunter.io or Apollo driver).
export async function domainSearch({ domain, limit = 10 }) {
  const l = integration('leads');
  if (!l.apiKey) throw new Error(`Leads: missing ${l.driver || 'hunter'} API key (afax connect leads).`);
  if (l.driver === 'apollo') return apolloSearch(l, domain, limit);
  const data = await http(
    `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=${limit}&api_key=${l.apiKey}`
  );
  const emails = data?.data?.emails || [];
  return emails.map((e) => ({
    name: [e.first_name, e.last_name].filter(Boolean).join(' ') || e.value.split('@')[0],
    title: e.position || '',
    company: data.data.organization || domain,
    email: e.value,
    verified: e.verification?.status === 'valid',
    score: e.confidence || 0,
    signal: e.department ? `dept: ${e.department}` : 'domain match',
  }));
}

// People search via the Apollo.io API.
async function apolloSearch(l, domain, limit) {
  const data = await http('https://api.apollo.io/api/v1/mixed_people/search', {
    method: 'POST',
    headers: { 'X-Api-Key': l.apiKey },
    json: { q_organization_domains_list: [domain], page: 1, per_page: limit },
  });
  return (data?.people || []).map((p) => ({
    name: p.name || [p.first_name, p.last_name].filter(Boolean).join(' '),
    title: p.title || '',
    company: p.organization?.name || domain,
    email: p.email || '',
    verified: p.email_status === 'verified',
    score: p.email_status === 'verified' ? 90 : 50,
    signal: p.seniority ? `seniority: ${p.seniority}` : 'domain match',
  })).filter((x) => x.email && !x.email.includes('not_unlocked'));
}

// Verify a single email is deliverable (Hunter driver).
export async function verify({ email }) {
  const l = integration('leads');
  if (!l.apiKey) throw new Error('Leads: missing API key.');
  if (l.driver === 'apollo') throw new Error('Email verification needs the Hunter driver (afax connect leads).');
  const data = await http(
    `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${l.apiKey}`
  );
  return { status: data?.data?.status, score: data?.data?.score };
}
