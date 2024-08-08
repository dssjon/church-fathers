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

  const prompt = `You are an expert church historian specializing in the writings of the Church Fathers. You have a talent for explaining complex theological concepts in simple terms. A user has searched for "${query}" and here are the top results from Church Fathers' commentaries:

${searchResults
  .slice(0, 4) 
  .map(
    (result) => `
- **${result.father_name}** (*${result.source_title}*, Book of ${
      result.book
    }): "${result.content}..."`
  )
  .join("\n")}

Please provide a concise and insightful summary of these search results, considering the following:

* **Explain the core theological concepts related to "${query}" as discussed by these Fathers.** 

Use clear, modern language accessible to someone with limited theological background. Your goal is to help the user understand the Church Fathers' thinking by providing insightful analysis of the provided excerpts.`;

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
        max_tokens: 500, 
        temperature: 0.1,
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
