// Telegram / Slack / Discord senders — all real HTTP, zero deps.
import { integration } from '../config.js';
import { http } from './http.js';

export function status() {
  const t = integration('telegram'), s = integration('slack'), d = integration('discord');
  return {
    telegram: !!t.botToken,
    slack: !!(s.webhookUrl || s.botToken),
    discord: !!d.webhookUrl,
  };
}

export async function telegramSend({ text, chatId }) {
  const t = integration('telegram');
  if (!t.botToken) throw new Error('Telegram: missing botToken.');
  const chat = chatId || t.chatId;
  if (!chat) throw new Error('Telegram: missing chatId.');
  return http(`https://api.telegram.org/bot${t.botToken}/sendMessage`, {
    method: 'POST',
    json: { chat_id: chat, text, parse_mode: 'Markdown' },
  });
}

export async function slackSend({ text }) {
  const s = integration('slack');
  if (s.webhookUrl) {
    return http(s.webhookUrl, { method: 'POST', json: { text } });
  }
  if (s.botToken) {
    return http('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { authorization: `Bearer ${s.botToken}` },
      json: { channel: s.channel || '#general', text },
    });
  }
  throw new Error('Slack: set webhookUrl or botToken.');
}

export async function discordSend({ text }) {
  const d = integration('discord');
  if (!d.webhookUrl) throw new Error('Discord: missing webhookUrl.');
  return http(d.webhookUrl, { method: 'POST', json: { content: text } });
}
