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

// Create a paid-ads campaign (paused) + ad set with a daily budget + targeting.
export async function adsCreateCampaign({ name, objective = 'OUTCOME_TRAFFIC', dailyBudget = 10, countries = ['US'], ageMin = 18, ageMax = 65 }) {
  const { m, url } = base();
  if (!m.accessToken || !m.adAccountId) throw new Error('Meta ads: need accessToken + adAccountId.');
  const act = `${url}/act_${m.adAccountId}`;
  const campaign = await http(`${act}/campaigns`, {
    method: 'POST',
    form: { name, objective, status: 'PAUSED', special_ad_categories: '[]', access_token: m.accessToken },
  });
  const adset = await http(`${act}/adsets`, {
    method: 'POST',
    form: {
      name: `${name} — ad set`,
      campaign_id: campaign.id,
      daily_budget: Math.round(Number(dailyBudget) * 100),
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: JSON.stringify({ geo_locations: { countries }, age_min: ageMin, age_max: ageMax }),
      status: 'PAUSED',
      access_token: m.accessToken,
    },
  });
  return { campaignId: campaign.id, adsetId: adset.id };
}

// Create an ad creative from copy + a link (and optional image URL), tied to the
// Facebook Page. This is what makes the ad actually runnable, not an empty shell.
export async function adsCreateCreative({ name, message, headline, link, imageUrl }) {
  const { m, url } = base();
  if (!m.accessToken || !m.adAccountId) throw new Error('Meta ads: need accessToken + adAccountId.');
  if (!m.pageId) throw new Error('Meta ads: need a pageId for the ad creative.');
  const link_data = {
    message: message || '',
    link: link || (m.pageId ? `https://facebook.com/${m.pageId}` : 'https://example.com'),
    name: headline || '',
    call_to_action: { type: 'LEARN_MORE' },
    ...(imageUrl ? { picture: imageUrl } : {}),
  };
  const creative = await http(`${url}/act_${m.adAccountId}/adcreatives`, {
    method: 'POST',
    form: {
      name: name || 'AFAX creative',
      object_story_spec: JSON.stringify({ page_id: m.pageId, link_data }),
      access_token: m.accessToken,
    },
  });
  return { creativeId: creative.id };
}

// Create the ad (PAUSED) that ties a creative to an ad set.
export async function adsCreateAd({ name, adsetId, creativeId }) {
  const { m, url } = base();
  if (!m.accessToken || !m.adAccountId) throw new Error('Meta ads: need accessToken + adAccountId.');
  const ad = await http(`${url}/act_${m.adAccountId}/ads`, {
    method: 'POST',
    form: { name: name || 'AFAX ad', adset_id: adsetId, creative: JSON.stringify({ creative_id: creativeId }), status: 'PAUSED', access_token: m.accessToken },
  });
  return { adId: ad.id };
}

// Read performance insights for a campaign/adset/ad (spend, impressions, clicks…).
export async function adsInsights({ id, datePreset = 'last_7d' }) {
  const { m, url } = base();
  if (!m.accessToken) throw new Error('Meta ads: need accessToken.');
  const fields = 'impressions,clicks,spend,ctr,cpc,reach,actions';
  const r = await http(`${url}/${id}/insights?date_preset=${datePreset}&fields=${fields}&access_token=${encodeURIComponent(m.accessToken)}`, { method: 'GET' });
  return (r.data && r.data[0]) || {};
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
