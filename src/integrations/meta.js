// Meta Graph API: Facebook Page post, Instagram publish, WhatsApp Cloud message.
// Requires a Meta app + long-lived access token with the right permissions.
import { integration } from '../config.js';
import { http } from './http.js';

function base() {
  const m = integration('meta');
  return { m, url: `https://graph.facebook.com/${m.graphVersion || 'v21.0'}` };
}

export function status() {
  const m = integration('meta');
  return {
    connected: !!m.accessToken,
    facebook: !!m.pageId,
    instagram: !!m.igUserId,
    whatsapp: !!m.whatsappPhoneId,
  };
}

// Post text (and optional link) to a Facebook Page.
export async function facebookPost({ message, link }) {
  const { m, url } = base();
  if (!m.accessToken || !m.pageId) throw new Error('Meta: need accessToken + pageId.');
  return http(`${url}/${m.pageId}/feed`, {
    method: 'POST',
    json: { message, link: link || undefined, access_token: m.accessToken },
  });
}

// Publish an image post to Instagram (2-step: create container, then publish).
export async function instagramPublish({ imageUrl, caption }) {
  const { m, url } = base();
  if (!m.accessToken || !m.igUserId) throw new Error('Meta: need accessToken + igUserId.');
  if (!imageUrl) throw new Error('Instagram requires a public imageUrl.');
  const container = await http(`${url}/${m.igUserId}/media`, {
    method: 'POST',
    json: { image_url: imageUrl, caption, access_token: m.accessToken },
  });
  return http(`${url}/${m.igUserId}/media_publish`, {
    method: 'POST',
    json: { creation_id: container.id, access_token: m.accessToken },
  });
}

// Send a WhatsApp message via the Cloud API.
export async function whatsappSend({ to, text }) {
  const { m, url } = base();
  if (!m.accessToken || !m.whatsappPhoneId) throw new Error('Meta: need accessToken + whatsappPhoneId.');
  return http(`${url}/${m.whatsappPhoneId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${m.accessToken}` },
    json: { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } },
  });
}
