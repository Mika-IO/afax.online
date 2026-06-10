// Base agent: wraps the LLM with a role/system prompt, business context, and
// persistent memory. Each module subclasses or instantiates this.
import { chat } from '../llm/index.js';
import { load, hasLLM } from '../config.js';
import { memoryBlock, remember } from '../memory.js';

export class Agent {
  constructor({ key, name, emoji, role, system }) {
    this.key = key;
    this.name = name;
    this.emoji = emoji;
    this.role = role;
    this.system = system;
  }

  // Build the full system prompt: role + business profile + memory.
  buildSystem(extra = '') {
    const { business } = load();
    const profile = [
      business.name && `Company: ${business.name}`,
      business.offer && `Offer: ${business.offer}`,
      business.icp && `Ideal customer (ICP): ${business.icp}`,
      business.tone && `Brand tone: ${business.tone}`,
      business.website && `Website: ${business.website}`,
    ]
      .filter(Boolean)
      .join('\n');
    return [
      this.system,
      profile && `\nBusiness profile:\n${profile}`,
      memoryBlock(this.key) && `\n${memoryBlock(this.key)}`,
      extra && `\n${extra}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  // Free-form generation.
  async generate(prompt, { temperature, maxTokens, extraSystem } = {}) {
    const { text } = await chat({
      system: this.buildSystem(extraSystem),
      messages: [{ role: 'user', content: prompt }],
      temperature,
      maxTokens,
    });
    return text;
  }

  // Structured generation — returns parsed JSON.
  async structured(prompt, { temperature, maxTokens, extraSystem } = {}) {
    const { json } = await chat({
      system: this.buildSystem(extraSystem),
      messages: [{ role: 'user', content: prompt }],
      json: true,
      temperature: temperature ?? 0.5,
      maxTokens,
    });
    return json;
  }

  note(text, meta) {
    remember(this.key, text, meta);
  }

  // True when an LLM is reachable; modules use this to pick AI vs template path.
  get online() {
    return hasLLM();
  }
}
