import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.FEATHERLESS_API_KEY,
  baseURL: process.env.FEATHERLESS_BASE_URL,
});

export async function chatCompletion(messages, options = {}) {
  const response = await client.chat.completions.create({
    model: process.env.FEATHERLESS_MODEL,
    messages,
    ...options,
  });

  return response;
}

export default client;
