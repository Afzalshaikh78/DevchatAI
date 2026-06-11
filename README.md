# DevchatAI
<img width="1907" height="962" alt="Screenshot 2026-06-11 114642" src="https://github.com/user-attachments/assets/b48f2396-36c8-48e0-991d-197d6f85674a" />

DevchatAI is a full-stack AI chat application built with Next.js, Prisma, PostgreSQL, Better Auth, OpenRouter, and UploadThing. It supports authenticated chats, model selection, PDF uploads, and retrieval-augmented responses from document content.

Live:https://devchat-ai-delta.vercel.app

## Features

- Authenticated chat experience with GitHub and Google sign-in
- AI chat powered by OpenRouter models
- Free-model discovery endpoint for model selection
- Chat persistence backed by Prisma and PostgreSQL
- PDF upload and document processing with semantic search over embedded chunks
- Streaming assistant responses with fallback model handling
- Theme support, React Query, and a modular UI built with shadcn-style components

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Prisma ORM
- PostgreSQL
- Better Auth
- OpenRouter AI SDK
- UploadThing
- Tailwind CSS 4
- React Query

## Project Structure

- `app/` - Next.js app router pages, layouts, and route handlers
- `modules/` - Feature modules for chat and authentication logic
- `components/` - Shared UI and provider components
- `lib/` - Database, auth, prompts, and shared utilities
- `prisma/` - Database schema and Prisma config
- `public/` - Static assets

## Getting Started

### Prerequisites

- Node.js 20 or newer
- A PostgreSQL database
- OpenRouter API key
- Voyage AI API key for embeddings
- GitHub OAuth app credentials
- Google OAuth app credentials
- UploadThing credentials, if your local setup uses the upload flow end to end

### Install dependencies

```bash
npm install
```

### Environment variables

Create a `.env` file in the project root with the variables used by the app:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
OPENROUTER_API_KEY="your-openrouter-key"
VOYAGE_API_KEY="your-voyage-key"
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

If your UploadThing setup needs additional environment variables, add those as required by your provider configuration.

### Set up the database

Generate the Prisma client and apply the schema to your database:

```bash
npx prisma generate
npx prisma db push
```

If you prefer migrations, use Prisma migration commands instead of `db push`.

### Run the development server

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Available Scripts

- `npm run dev` - Start the Next.js development server
- `npm run build` - Generate production build
- `npm run start` - Start the production server
- `npm run lint` - Run ESLint
- `npm run postinstall` - Generate Prisma client after install
- `npm run prebuild` - Generate Prisma client before build

## How It Works

### Chat flow

1. The client sends a chat request to `POST /api/chat`.
2. The server validates the request, probes the selected OpenRouter model, and falls back to alternates when needed.
3. If the chat has uploaded documents, the server searches for similar chunks and injects that context into the system prompt.
4. The assistant response streams back to the client and is saved to PostgreSQL.

### Document flow

1. A PDF is uploaded through UploadThing.
2. The app extracts text with `unpdf`.
3. The extracted text is chunked and embedded with Voyage AI.
4. Chunks are stored in PostgreSQL using a vector column.
5. Later chat requests can retrieve the most relevant chunks for RAG-style answers.

### Authentication

Authentication is handled by Better Auth with Prisma-backed persistence and social login providers for GitHub and Google.

## Notes

- The app uses a generated Prisma client in `lib/generated/prisma`.
- The database schema includes chat, message, document, and document chunk models.
- The app is configured with a system prompt tuned for concise, helpful developer-focused answers.

## Deployment

For production, set the same environment variables in your hosting provider, ensure PostgreSQL is available, and run the build command:

```bash
npm run build
```

Then start the app with:

```bash
npm run start
```

## License

No license file is currently included. Add one if you plan to publish or share the project publicly.
