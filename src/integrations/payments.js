// 💳 Stripe payments — real payment links for invoices, zero deps.
// Pair with `afax serve` (/webhook/stripe) to auto-mark invoices paid and
// book revenue when the customer pays.
import { integration } from '../config.js';
import { http } from './http.js';

const API = 'https://api.stripe.com/v1';

export function status() {
  const s = integration('stripe');
  return { connected: !!s.secretKey, webhook: !!s.webhookSecret };
}

function auth() {
  const s = integration('stripe');
  if (!s.secretKey) throw new Error('Stripe: missing secretKey (afax connect stripe).');
  return { authorization: `Bearer ${s.secretKey}` };
}

// Create a hosted payment link for an amount. Returns { id, url }.
export async function createPaymentLink({ name, amount, currency = 'usd', invoiceNumber = '' }) {
  const price = await http(`${API}/prices`, {
    method: 'POST',
    headers: auth(),
    form: {
      unit_amount: Math.round(Number(amount) * 100),
      currency,
      'product_data[name]': name,
    },
  });
  const link = await http(`${API}/payment_links`, {
    method: 'POST',
    headers: auth(),
    form: {
      'line_items[0][price]': price.id,
      'line_items[0][quantity]': 1,
      ...(invoiceNumber ? { 'metadata[invoice]': invoiceNumber } : {}),
    },
  });
  return { id: link.id, url: link.url };
}
