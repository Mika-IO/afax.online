// Real lead sourcing / enrichment via Hunter.io.
// Returns verified business emails for a domain. Requires HUNTER_API_KEY.
import { integration } from '../config.js';
import { http } from './http.js';

export function status() {
  const l = integration('leads');
  return { connected: !!l.apiKey, driver: l.driver };
}

// Find real contacts at a company domain.
export async function domainSearch({ domain, limit = 10 }) {
  const l = integration('leads');
  if (!l.apiKey) throw new Error('Leads: missing Hunter API key (integrations.leads.apiKey).');
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

// Verify a single email is deliverable.
export async function verify({ email }) {
  const l = integration('leads');
  if (!l.apiKey) throw new Error('Leads: missing Hunter API key.');
  const data = await http(
    `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${l.apiKey}`
  );
  return { status: data?.data?.status, score: data?.data?.score };
}
