import OpenAI from 'openai';

let _client = null;

function getClient() {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.FEATHERLESS_API_KEY || 'dummy',
      baseURL: process.env.FEATHERLESS_BASE_URL,
    });
  }
  return _client;
}

export async function chatCompletion(messages, options = {}) {
  const response = await getClient().chat.completions.create({
    model: process.env.FEATHERLESS_MODEL,
    messages,
    ...options,
  });

  return response;
}

export default getClient;
