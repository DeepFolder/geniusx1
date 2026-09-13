import OpenAI from "openai";

// Reading saved work must be possible before an AI key is configured.
// Construct the real SDK on first use; never send placeholder credentials.
export function createLazyOpenAI(): OpenAI {
  let client: OpenAI | undefined;
  return new Proxy({} as OpenAI, {
    get(_target, property) {
      const apiKey = process.env.OPENAI_API_KEY?.trim();
      if (!apiKey) throw new Error("AI generation needs OPENAI_API_KEY in the server environment.");
      client ??= new OpenAI({ apiKey });
      const value = Reflect.get(client, property, client);
      return typeof value === "function" ? value.bind(client) : value;
    },
  });
}
