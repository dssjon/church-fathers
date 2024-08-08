# Church Fathers Commentary Semantic Search & Summarize

This application provides a semantic search interface for exploring commentaries from early Church Fathers on New Testament books. It uses embedding-based search to find relevant passages based on user queries.

## Features

- Semantic search across commentaries from multiple Church Fathers
- Filter search by specific books of the New Testament and Church Fathers
- Interactive multi-select filters for books and authors
- Client-side embedding generation and similarity search
- Optional AI-generated summaries of search results
- Responsive design for desktop and mobile use

## Technology Stack

- Frontend: HTML, CSS (Tailwind), JavaScript
- Embedding Model: BAAI/bge-large-en-v1.5 (via @xenova/transformers)
- Data Storage: IndexedDB (with localStorage fallback)
- Markdown Rendering: marked.js
- ZIP File Handling: JSZip
- Backend API (for summaries): Vercel Serverless Functions

## Setup and Usage

1. Clone the repository
2. Install dependencies (requires commentary DB & embeddings generation)
3. Set up environment variables (e.g., ANTHROPIC_API_KEY for summaries)
4. Deploy to a web server or run locally

## Data Source

The embeddings used in this application were generated from a SQLite database provided by the [Historical Christian Faith Commentaries Database](https://github.com/HistoricalChristianFaith/Commentaries-Database). This valuable resource contains a wealth of commentary text from early Church Fathers.

## Acknowledgments

- [Historical Christian Faith Commentaries Database](https://github.com/HistoricalChristianFaith/Commentaries-Database) for the original commentary data
- Hugging Face and the BGE team for the embedding model
- Xenova for the JavaScript implementation of transformers
- Anthropic for the Claude API used in generating summaries

