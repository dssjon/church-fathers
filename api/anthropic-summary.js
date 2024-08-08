import fetch from "node-fetch";

export const maxDuration = 60; // Set maximum execution time to 60 seconds

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { query, searchResults } = req.body;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_API_KEY) {
    return res
      .status(500)
      .json({ error: "Anthropic API key is not configured" });
  }
  
  if (!Array.isArray(searchResults)) {
    return res.status(400).json({ error: "searchResults must be an array" });
  }

  const prompt = `You are an expert church historian with a talent for explaining complex theological concepts in simple terms. Please provide an accessible summary of the following search results for the query "${query}" from Church Fathers' commentaries:

${searchResults
  .slice(0, 4)
  .map(
    (result) => `
- ${result.father_name} (${result.source_title}, Book of ${
      result.book
    }): "${result.content.substring(0, 100)}..."`
  )
  .join("\n")}

In your summary:
1. Explain the main ideas and teachings in simple, modern language.
2. Highlight how these teachings might apply to everyday life today.
3. Briefly mention any interesting historical context that helps understand the fathers' perspectives.
4. Include the names of the church fathers, their sources, and which biblical books they were commenting on.
5. If there are differences in views among the fathers, note them briefly.

Aim for a concise, engaging summary that someone with little background in theology could understand and find relevant.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 750,
        temperature: 0.5,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    res.status(200).json({ summary: data.content[0].text });
  } catch (error) {
    console.error("Error calling Anthropic API:", error);
    res
      .status(500)
      .json({ error: "An error occurred while generating the summary." });
  }
}
