# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Starting the Application
- `npm start` - Start the production server on port 3000
- `npm run dev` - Start development server with auto-restart using nodemon

### Dependencies Installation
- `npm install` - Install all required dependencies

## Environment Configuration

Create a `.env` file from `.env.example` with the following required keys:
- `OPENAI_API_KEY` - Required for embeddings and chat completions
- `TAVILY_API_KEY` - Optional, for web search functionality
- `PORT` - Server port (default: 3000)
- `VECTOR_STORE_PATH` - Path to FAISS vector database (default: ./vector_store)

## Application Architecture

### Core Components

1. **Server (server.js)**: Express.js server handling REST API endpoints
   - `/upload` - Document upload and processing
   - `/query` - Vector search queries
   - `/hybrid-query` - Combined keyword + semantic search
   - `/status` - Knowledge base status
   - `/clear` - Clear vector store

2. **Document Processing Pipeline**:
   - `documentProcessor.js` - Handles PDF, TXT, DOCX parsing and chunking
   - Chunk size: 1000 chars with 200 char overlap
   - Max file size: 10MB

3. **Search Systems**:
   - `vectorStore.js` - FAISS vector database management using text-embedding-ada-002
   - `hybridSearchEngine.js` - Implements Reciprocal Rank Fusion (RRF) for combined searches
   - `queryEngine.js` - RAG pipeline with GPT-4o-mini for response generation
   - `questionClassifier.js` - Classifies queries to route between document search and direct AI responses

4. **Web Search Integration**:
   - `tavilySearch.js` - Optional Tavily API integration for web search capabilities

5. **Frontend**:
   - Single-page application in `/public`
   - Drag-and-drop file upload
   - Real-time search with detailed analytics
   - Search type selection (vector/keyword/hybrid)

## Key Implementation Details

- **Hybrid Search**: Configurable weights for keyword vs semantic search (default: 30% keyword, 70% semantic)
- **Multi-language Support**: Automatic language detection with native response matching
- **Persistent Storage**: FAISS vector store persists across server restarts
- **Search Analytics**: Detailed metrics including scores, rankings, and search type indicators
- **Error Handling**: Graceful fallback when optional services (Tavily) are unavailable