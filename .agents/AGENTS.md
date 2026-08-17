# FactLens Project Rules and Architecture

## 1. Architecture Overview
FactLens is a real-time OSINT (Open-Source Intelligence) fact-checking application that monitors screens/audio and verifies claims.
- **Frontend (web/index.html)**: Uses a Chrome extension or WebRTC to capture the screen and audio. Calls `/api/analyze/ocr` continuously.
- **Preprocessing Backend (server/routes/preprocess.js)**: Receives OCR and Audio texts, formulates sentences, reconstructs context, resolves coreferences, and extracts actionable "Master Events" and "Facts".
- **Verification Backend (server/routes/analyze.js & factVerifier.js)**: Accepts facts and streams the verification process back to the frontend using Server-Sent Events (SSE).
- **LLM/API dependencies**: OpenAI GPT-4o for entity resolution and fact verification. Google FactCheck API, DuckDuckGo Lite, and Wikipedia API for cross-referencing.

## 2. Server-Sent Events (SSE) Streaming Protocol
- The backend explicitly streams execution logs, extracted sources, and scraped snippets to the frontend to keep the user engaged instead of using a traditional loading spinner.
- **CRITICAL BUG PREPAREDNESS (SSE Parsing)**: When parsing SSE chunks in JavaScript via `TextDecoder` and `fetch`, ALWAYS split by newline characters `\n\n`. **NEVER** use escaped literal strings `\\n\\n` in the `split()` function, as it will cause the buffer to indefinitely accumulate and freeze the frontend UI without throwing an error.

## 3. Design Aesthetics and UI State
- FactLens uses a transparent, dark-mode, glassmorphism UI. 
- "Verification Monitor" UI: Explicitly visualize all AI intermediate steps (Search Queries -> Found Sources -> Scraped Snippets) rather than abstracting them into a single step. 
- "Accordion" Details: Facts should show snippets immediately upon expansion, with deeper source metadata (URL, relevance) hidden under an additional clickable source toggle.
- **Emojis**: Per the user's explicit instruction, all emojis have been permanently removed from the UI and backend logging. Do NOT re-introduce emojis into the frontend or backend logs.
