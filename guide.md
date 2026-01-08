# RAG Knowledge Base - Source Code Guide

> **Comprehensive technical documentation for all source code in the `src/` directory**

---

## Table of Contents

1. [Overview](#overview)
2. [documentProcessor.js](#documentprocessorjs)
3. [vectorStore.js](#vectorstorejs)
4. [hybridSearchEngine.js](#hybridsearchenginejs)
5. [questionClassifier.js](#questionclassifierjs)
6. [tavilySearch.js](#tavilysearchjs)
7. [queryEngine.js](#queryenginejs)
8. [Data Flow](#data-flow)
9. [Best Practices](#best-practices)

---

## Overview

The `src/` directory contains the core business logic for the RAG (Retrieval-Augmented Generation) Knowledge Base system. It consists of 6 main modules:

| File | Purpose | Key Technologies |
|------|---------|------------------|
| `documentProcessor.js` | Document parsing and chunking | pdf-parse, mammoth, LangChain |
| `vectorStore.js` | Vector storage and similarity search | FAISS, OpenAI Embeddings |
| `hybridSearchEngine.js` | Keyword + semantic search fusion | Natural.js, RRF algorithm |
| `questionClassifier.js` | AI-powered question classification | OpenAI GPT, LangChain |
| `tavilySearch.js` | Web search integration | Tavily API |
| `queryEngine.js` | Query orchestration and LLM integration | OpenAI GPT, LangChain |

---

## documentProcessor.js

### Purpose
Processes uploaded documents (PDF, TXT, DOCX) and converts them into chunks suitable for vector storage.

### Class: `DocumentProcessor`

#### Constructor
```javascript
constructor()
```
Initializes the text splitter with:
- **Chunk size**: 1000 characters
- **Chunk overlap**: 200 characters
- **Separators**: `["\n\n", "\n", " ", ""]`

#### Methods

##### `processDocument(filePath, filename)`
Main entry point for document processing.

**Parameters:**
- `filePath` (string): Absolute path to the uploaded file
- `filename` (string): Original filename

**Returns:** Array of Document objects with metadata

**Process Flow:**
```
1. Read file from disk
2. Determine file type from extension
3. Extract text based on file type:
   - PDF → pdf-parse
   - DOCX → mammoth
   - TXT → direct read
4. Split text into chunks
5. Add metadata to each chunk
6. Return array of Document objects
```

**Example:**
```javascript
const processor = new DocumentProcessor();
const chunks = await processor.processDocument(
    '/path/to/file.pdf',
    'research-paper.pdf'
);
// Returns: [
//   Document { pageContent: "...", metadata: { source: "research-paper.pdf", chunkIndex: 0, ... } },
//   Document { pageContent: "...", metadata: { source: "research-paper.pdf", chunkIndex: 1, ... } },
//   ...
// ]
```

##### `extractTextFromPDF(buffer)`
Extracts text from PDF files using pdf-parse library.

**Parameters:**
- `buffer` (Buffer): PDF file buffer

**Returns:** Extracted text string

**Error Handling:** Throws error if PDF parsing fails

##### `extractTextFromDOCX(buffer)`
Extracts text from DOCX files using mammoth library.

**Parameters:**
- `buffer` (Buffer): DOCX file buffer

**Returns:** Extracted text string

**Process:**
1. Converts DOCX to plain text
2. Extracts value from result object

##### `splitIntoChunks(text)`
Splits text into overlapping chunks using LangChain's RecursiveCharacterTextSplitter.

**Parameters:**
- `text` (string): Full document text

**Returns:** Array of Document objects

**Algorithm:**
- Tries to split on paragraph boundaries (`\n\n`)
- Falls back to line boundaries (`\n`)
- Falls back to word boundaries (` `)
- Falls back to character boundaries
- Maintains 200-character overlap between chunks for context preservation

### Key Concepts

**Why Chunking?**
- LLMs have token limits (e.g., GPT-4: 8k-128k tokens)
- Smaller chunks improve search precision
- Overlap preserves context across boundaries

**Metadata Structure:**
```javascript
{
    source: "filename.pdf",           // Original filename
    chunkIndex: 0,                    // Chunk number (0-based)
    totalChunks: 10,                  // Total chunks in document
    fileType: "pdf",                  // File extension
    processedAt: "2026-01-06T...",   // ISO timestamp
    chunkSize: 1000                   // Characters per chunk
}
```

---

## vectorStore.js

### Purpose
Manages vector embeddings and performs similarity search using FAISS (Facebook AI Similarity Search).

### Class: `VectorStore`

#### Constructor
```javascript
constructor()
```
Initializes:
- OpenAI embeddings model (`text-embedding-ada-002`)
- FAISS store instance
- Hybrid search engine
- Storage path (`./vector_store`)

**Validation:** Throws error if `OPENAI_API_KEY` is not configured

#### Methods

##### `initialize()`
Loads existing vector store from disk or creates a new one.

**Process Flow:**
```
1. Check if vector_store directory exists
2. If exists:
   - Load FAISS index from disk
   - Load document metadata
   - Initialize hybrid search engine
3. If not exists:
   - Create empty FAISS store
   - Initialize with empty documents
4. Return initialization status
```

**Returns:** Promise<void>

##### `addDocuments(documents)`
Adds new documents to the vector store and updates the index.

**Parameters:**
- `documents` (Array<Document>): Array of LangChain Document objects

**Process Flow:**
```
1. Generate embeddings for each document (OpenAI API)
2. Add embeddings to FAISS index
3. Update hybrid search engine index
4. Save to disk
5. Update document count
```

**Example:**
```javascript
await vectorStore.addDocuments([
    new Document({
        pageContent: "Machine learning is...",
        metadata: { source: "ml-guide.pdf", chunkIndex: 0 }
    })
]);
```

##### `similaritySearch(query, k = 4)`
Performs semantic similarity search using vector embeddings.

**Parameters:**
- `query` (string): User's question
- `k` (number): Number of results to return (default: 4)

**Returns:** Array of search results with scores

**Algorithm:**
```
1. Convert query to embedding vector (1536 dimensions)
2. Use FAISS to find k nearest neighbors
3. Calculate cosine similarity scores
4. Return results sorted by relevance
```

**Result Structure:**
```javascript
[
    {
        content: "Machine learning is a subset of AI...",
        metadata: { source: "ml-guide.pdf", chunkIndex: 0, ... },
        score: 0.89  // Cosine similarity (0-1)
    },
    ...
]
```

##### `save()`
Persists the vector store to disk.

**Saves:**
- `faiss.index` - FAISS index file
- `docstore.json` - Document metadata
- `metadata.json` - System metadata

##### `clear()`
Deletes all documents and resets the vector store.

**Process:**
1. Delete vector_store directory
2. Reinitialize empty store
3. Reset document count

##### `getStatus()`
Returns current status of the vector store.

**Returns:**
```javascript
{
    documentCount: 58,
    lastUpdated: "2026-01-06T17:30:00.000Z",
    indexSize: "2.4 MB"
}
```

### Key Concepts

**Vector Embeddings:**
- Text converted to 1536-dimensional vectors
- Similar meanings → similar vectors
- Enables semantic search (not just keyword matching)

**FAISS Index:**
- Efficient similarity search in high-dimensional spaces
- Uses HNSW (Hierarchical Navigable Small World) algorithm
- Sub-linear search time complexity

**Cosine Similarity:**
```
similarity = (A · B) / (||A|| × ||B||)
Range: -1 to 1 (we use 0 to 1 for normalized vectors)
```

---

## hybridSearchEngine.js

### Purpose
Combines keyword-based search with semantic search using LangChain's retriever system and Reciprocal Rank Fusion (RRF).

### Architecture

The module now uses LangChain's `BaseRetriever` class to create custom retrievers:

1. **BM25Retriever** - Custom keyword search retriever
2. **EnsembleRetriever** - Combines multiple retrievers using RRF
3. **HybridSearchEngine** - Main class that orchestrates hybrid search

### Class: `BM25Retriever` (extends BaseRetriever)

Custom LangChain retriever for keyword-based search.

#### Constructor
```javascript
constructor(documents, k = 4)
```

**Parameters:**
- `documents` (Array<Document>): LangChain Document objects
- `k` (number): Number of results to return

**Initializes:**
- TF-IDF index using Natural.js
- Document corpus
- Result limit (k)

#### Methods

##### `_getRelevantDocuments(query)`
Internal method called by LangChain's retriever interface.

**Process:**
1. Preprocess query text (lowercase, remove punctuation)
2. Tokenize into terms
3. Calculate TF-IDF scores for each document
4. Rank documents by score
5. Return top k documents

**Returns:** Array<Document> - Top k most relevant documents

##### `_preprocessText(text)`
Preprocesses text for keyword matching.

**Transformations:**
- Convert to lowercase
- Remove punctuation (preserve Chinese characters)
- Normalize whitespace
- Trim

### Class: `EnsembleRetriever` (extends BaseRetriever)

Combines multiple retrievers using Reciprocal Rank Fusion.

#### Constructor
```javascript
constructor(retrievers, weights)
```

**Parameters:**
- `retrievers` (Array<BaseRetriever>): Array of retriever instances
- `weights` (Array<number>): Weight for each retriever (must sum to 1.0)

#### Methods

##### `_getRelevantDocuments(query)`
Combines results from all retrievers using RRF.

**RRF Algorithm:**
```javascript
// For each document appearing in any retriever's results:
RRF_score = Σ (weight_i / (k + rank_i))

// Where:
// - weight_i: weight of retriever i
// - rank_i: rank of document in retriever i's results (1-based)
// - k: constant (60) to prevent division by small numbers
```

**Process:**
1. Query all retrievers in parallel
2. Collect results with their ranks
3. Apply RRF formula to calculate combined scores
4. Sort by combined score
5. Return merged results

**Returns:** Array<Document> - Fused and ranked documents

### Class: `HybridSearchEngine`

Main class that provides the hybrid search interface.

#### Constructor
```javascript
constructor(vectorStore)
```

**Note:** vectorStore is stored but not used in constructor. It's passed to `buildIndex()` method.

#### Methods

##### `buildIndex(documents, vectorStore)`
Builds both BM25 and ensemble retriever indexes.

**Parameters:**
- `documents` (Array): Document objects to index
- `vectorStore` (Object): Vector store instance for semantic search

**Process:**
1. Convert documents to LangChain Document format
2. Create BM25Retriever with documents
3. Get vector store retriever via `vectorStore.asRetriever()`
4. Create EnsembleRetriever combining both
5. Set default weights: 0.3 (BM25), 0.7 (semantic)

**Example:**
```javascript
await hybridSearchEngine.buildIndex(documents, vectorStore);
```

##### `keywordSearch(query, k = 10)`
Performs keyword-only search using BM25.

**Parameters:**
- `query` (string): Search query
- `k` (number): Number of results

**Returns:** Array of results with keyword scores

##### `semanticSearch(query, k = 10)`
Performs semantic-only search using vector store.

**Delegates to:** `vectorStore.similaritySearch()`

##### `hybridSearch(query, options = {})`
Performs hybrid search combining keyword and semantic approaches.

**Parameters:**
```javascript
{
    maxResults: 4,
    keywordWeight: 0.3,
    semanticWeight: 0.7
}
```

**Process:**
1. Check if index is built
2. Update ensemble retriever weights if needed
3. Call `ensembleRetriever.getRelevantDocuments(query)`
4. Format results
5. Return top maxResults

**Returns:**
```javascript
[
    {
        content: "Document text...",
        metadata: { source: "file.pdf", chunkIndex: 0 },
        score: 0.85,
        searchType: 'hybrid'
    },
    ...
]
```

##### `rebuildIndex()`
Rebuilds the index using stored documents and vectorStore.

##### `getIndexStats()`
Returns index statistics.

**Returns:**
```javascript
{
    isIndexed: true,
    documentCount: 107,
    hasEnsembleRetriever: true,
    hasBM25Retriever: true
}
```

### Key Concepts

**Why LangChain Integration?**
- **Standardization**: Uses LangChain's retriever interface
- **Extensibility**: Easy to add new retriever types
- **Compatibility**: Works seamlessly with other LangChain components
- **Best Practices**: Leverages well-tested base classes

**BaseRetriever Benefits:**
- Consistent interface across all retrievers
- Built-in error handling
- Async/await support
- Easy composition and chaining

**RRF (Reciprocal Rank Fusion):**
- Rank-based fusion (position matters, not absolute scores)
- No need to normalize different score ranges
- Proven effective in information retrieval research
- Simple yet powerful algorithm

**Hybrid Search Advantages:**
- **Keyword search**: Good for exact matches, acronyms, technical terms
- **Semantic search**: Good for conceptual matches, paraphrases
- **Hybrid**: Best of both worlds - catches both exact and semantic matches

---

## questionClassifier.js

### Purpose
Classifies user questions to determine if they need search or can be answered directly by AI.

### Class: `QuestionClassifier`

#### Constructor
```javascript
constructor()
```
Initializes:
- OpenAI GPT model (`gpt-4o-mini`)
- Classification prompt template
- Pattern matching rules

**Validation:** Throws error if `OPENAI_API_KEY` is missing

#### Methods

##### `classifyQuestion(question)`
Classifies a question as either DIRECT or SEARCH.

**Parameters:**
- `question` (string): User's question

**Returns:** `"DIRECT"` or `"SEARCH"`

**Two-Stage Classification:**

**Stage 1: Pattern Matching (Fast)**
```javascript
// DIRECT patterns:
- Greetings: /^(hi|hello|hey|你好|嗨)/i
- Personal questions: /(your name|who are you|你叫什么)/i
- Math: /(calculate|compute|what is \d+)/i

// SEARCH patterns:
- Document references: /(document|file|uploaded|根据文档)/i
- Current events: /(latest|recent|current|news|最新)/i
```

**Stage 2: LLM Classification (Accurate)**
If pattern matching is inconclusive, uses GPT to classify.

**Classification Prompt:**
```
You are a question classifier. Classify questions as:

DIRECT - Questions that can be answered using general AI knowledge:
- Personal questions about the AI
- Greetings and casual conversation
- General knowledge questions
- Math calculations
- Questions not requiring specific documents

SEARCH - Questions requiring specific information:
- Questions about uploaded documents
- Questions about current events
- Questions needing specific data
- Questions referencing files or documents

Question: {question}

Respond with ONLY "DIRECT" or "SEARCH"
```

**Example Classifications:**
```javascript
await classifyQuestion("Hello, how are you?")
// → "DIRECT"

await classifyQuestion("What does the uploaded document say about AI?")
// → "SEARCH"

await classifyQuestion("What is the capital of France?")
// → "DIRECT"

await classifyQuestion("Latest news about climate change")
// → "SEARCH"
```

### Key Concepts

**Why Classification?**
- **Performance**: Direct answers are faster (no search needed)
- **Accuracy**: Search-based answers use relevant context
- **User Experience**: Natural conversation for greetings, precise answers for queries

**Fallback Strategy:**
- If classification fails → default to SEARCH (conservative approach)
- Better to search unnecessarily than miss relevant information

---

## tavilySearch.js

### Purpose
Integrates Tavily API for real-time web search with AI-optimized results.

### Class: `TavilySearchAPIWrapper`

#### Constructor
```javascript
constructor(options = {})
```

**Options:**
```javascript
{
    maxResults: 5,              // Number of search results
    searchDepth: 'basic',       // 'basic' or 'advanced'
    includeImages: false,       // Include image results
    includeAnswer: true         // Include AI-generated answer
}
```

**Validation:** Throws error if `TAVILY_API_KEY` is not set

#### Methods

##### `search(query)`
Performs basic web search and returns formatted results.

**Parameters:**
- `query` (string): Search query

**Returns:** String with formatted search results

**API Endpoint:** `https://api.tavily.com/search`

##### `searchWithMetadata(query)`
Performs web search and returns structured results with metadata.

**Returns:**
```javascript
[
    {
        content: "Article content...",
        metadata: {
            title: "Article Title",
            url: "https://example.com/article",
            score: 0.95,           // Relevance score
            publishedDate: "2026-01-01"
        }
    },
    ...
]
```

**Process Flow:**
```
1. Send query to Tavily API
2. Receive AI-optimized search results
3. Extract relevant content and metadata
4. Format as LangChain-compatible documents
5. Return structured results
```

##### `searchNews(query)`
Specialized search for news articles.

**Differences from regular search:**
- Filters for recent content
- Prioritizes news sources
- Includes publication dates

### Key Concepts

**Tavily API Features:**
- AI-optimized search results
- Content extraction and summarization
- Relevance scoring
- Real-time web data

**Use Cases:**
- Current events queries
- Latest information
- Web-based fact-checking
- Supplementing document knowledge

---

## queryEngine.js

### Purpose
Orchestrates the entire query processing pipeline, integrating all components to generate AI-powered answers.

### Class: `QueryEngine`

#### Constructor
```javascript
constructor(vectorStore)
```

**Initializes:**
- Vector store reference
- Hybrid search engine
- Question classifier
- Tavily search wrapper
- OpenAI LLM (`gpt-4o-mini`)
- Prompt templates (direct and search modes)

**Prompt Templates:**

**Direct Prompt** (for general questions):
```
You are Claude, a helpful AI assistant created by Anthropic.
Answer the user's question directly using your general knowledge.
Respond in the same language as the user's question.

DO NOT reference any documents or sources.
Be conversational and natural.

Conversation History: {conversationHistory}
Question: {question}
```

**Search Prompt** (for document-based questions):
```
You are a helpful AI assistant.
Answer using the provided context.
Respond in the same language as the user's question.

Use the context to answer. Do NOT include source references.
If context is not relevant, say so and answer from general knowledge.

Conversation History: {conversationHistory}
Context: {context}
Question: {question}
```

#### Core Methods

##### `query(question, options = {})`
Main query method with intelligent routing.

**Parameters:**
```javascript
{
    maxResults: 4,
    includeScores: false,
    minScore: 0.1,
    conversationHistory: [],
    forceSearchMode: false
}
```

**Process Flow:**
```
1. Classify question (DIRECT vs SEARCH)
2. If DIRECT:
   → Call directQuery()
   → Return AI answer without search
3. If SEARCH:
   → Search vector store
   → Filter by minScore
   → Build context from results
   → Generate answer with LLM
   → Return answer + sources
```

**Returns:**
```javascript
{
    text: "Machine learning is...",
    sources: [
        {
            filename: "ml-guide.pdf",
            chunks: [
                {
                    chunkIndex: 1,
                    score: 0.89,
                    content: "..."
                }
            ],
            fileType: "pdf",
            processedAt: "2026-01-06T..."
        }
    ],
    searchResults: [...],  // If includeScores: true
    queryType: "search"
}
```

##### `directQuery(question, options = {})`
Answers questions using AI knowledge without searching documents.

**Use Cases:**
- Greetings: "Hello!"
- Personal questions: "What's your name?"
- General knowledge: "What is gravity?"
- Math: "Calculate 15 * 23"

**Process:**
1. Format conversation history
2. Call LLM with direct prompt
3. Optionally find reference sources (score > 0.3)
4. Return answer with optional sources

##### `hybridQuery(question, options = {})`
Performs hybrid search (keyword + semantic) and generates answer.

**Parameters:**
```javascript
{
    maxResults: 4,
    searchType: 'hybrid',  // 'hybrid', 'semantic', 'keyword'
    keywordWeight: 0.3,
    semanticWeight: 0.7,
    minScore: 0.01,
    conversationHistory: []
}
```

**Search Types:**
- `'keyword'`: TF-IDF based search
- `'semantic'`: Vector similarity search
- `'hybrid'`: RRF fusion of both

**Returns:** Answer with search statistics

##### `webSearchQuery(question, options = {})`
Performs web search using Tavily and generates answer.

**Parameters:**
```javascript
{
    maxResults: 5,
    includeAnswer: true,
    backend: 'web',  // 'web' or 'news'
    conversationHistory: []
}
```

**Process:**
1. Check Tavily API availability
2. Perform web search
3. Format results as context
4. Generate answer using web context
5. Return answer with web sources

**Use Cases:**
- "Latest news about AI"
- "Current weather in Tokyo"
- "Recent developments in quantum computing"

##### `combinedSearchQuery(question, options = {})`
Combines web search AND document search for comprehensive answers.

**Parameters:**
```javascript
{
    maxWebResults: 3,
    maxDocResults: 3,
    webWeight: 0.5,
    docWeight: 0.5,
    conversationHistory: []
}
```

**Process:**
```
1. Parallel execution:
   - Web search (Tavily)
   - Document search (hybrid)
2. Combine contexts:
   - Web results
   - Document results
3. Generate comprehensive answer
4. Return combined sources
```

**Best for:**
- Questions needing both current info and document knowledge
- Fact-checking document claims against web sources
- Comprehensive research queries

#### Utility Methods

##### `formatContext(searchResults)`
Formats search results into context string for LLM.

**Output Format:**
```
Document 1 (Source: file.pdf, Chunk: 1):
[Content of chunk 1]

---

Document 2 (Source: file.pdf, Chunk: 2):
[Content of chunk 2]
```

##### `extractSources(searchResults)`
Extracts and groups sources by filename.

**Returns:**
```javascript
[
    {
        filename: "ml-guide.pdf",
        chunks: [
            { chunkIndex: 1, score: 0.89, content: "..." },
            { chunkIndex: 3, score: 0.76, content: "..." }
        ],
        fileType: "pdf",
        processedAt: "2026-01-06T..."
    }
]
```

##### `formatConversationHistory(conversationHistory)`
Formats chat history for LLM context.

**Input:**
```javascript
[
    { role: "user", content: "What is AI?" },
    { role: "assistant", content: "AI is..." },
    { role: "user", content: "Tell me more" }
]
```

**Output:**
```
User: What is AI?
Assistant: AI is...
User: Tell me more
```

**Limits:** Last 10 messages (5 conversation turns) to prevent context overflow

### Key Concepts

**Conversation History:**
- Maintains context across multiple turns
- Enables follow-up questions
- Prevents repetitive answers

**Score Filtering:**
- `minScore`: Filters out low-relevance results
- Prevents hallucinations from irrelevant context
- Default: 0.1 for regular search, 0.01 for hybrid

**Multi-language Support:**
- Prompts instruct LLM to respond in user's language
- Works for Chinese, English, and other languages
- No explicit language detection needed

---

## Data Flow

### Document Upload Flow

```
User uploads PDF
    ↓
server.js (/upload endpoint)
    ↓
documentProcessor.processDocument()
    ↓
├─ Extract text (PDF/DOCX/TXT)
├─ Split into chunks (1000 chars, 200 overlap)
└─ Add metadata
    ↓
vectorStore.addDocuments()
    ↓
├─ Generate embeddings (OpenAI)
├─ Add to FAISS index
├─ Update hybrid search index
└─ Save to disk
    ↓
Response: { message: "Success", chunks: 15 }
```

### Query Processing Flow

```
User asks question
    ↓
server.js (/query, /hybrid-query, etc.)
    ↓
validateQuestion middleware
    ↓
classifyAndHandleDirectQuery middleware
    ↓
├─ questionClassifier.classifyQuestion()
│   ├─ Pattern matching
│   └─ LLM classification
│       ↓
│   ┌─────────────┬─────────────┐
│   ↓ DIRECT      ↓ SEARCH      ↓
│   directQuery() │ Continue     │
│   Return answer │              │
│                 ↓              │
└─────────────────┴──────────────┘
    ↓
queryEngine.query() / hybridQuery() / webSearchQuery()
    ↓
Search Phase:
├─ Vector search (FAISS)
├─ Keyword search (TF-IDF)
├─ Hybrid search (RRF)
└─ Web search (Tavily)
    ↓
Filter and rank results
    ↓
formatContext()
    ↓
LLM generates answer
    ↓
extractSources()
    ↓
formatQueryResponse()
    ↓
Response: { question, answer, sources, searchResults }
```

---

## Best Practices

### 1. Error Handling

All methods should handle errors gracefully:

```javascript
try {
    const result = await vectorStore.similaritySearch(query);
    return result;
} catch (error) {
    console.error('Search failed:', error);
    throw new Error(`Search failed: ${error.message}`);
}
```

### 2. API Key Validation

Always validate API keys in constructors:

```javascript
if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key is required');
}
```

### 3. Logging

Use descriptive console logs for debugging:

```javascript
console.log('✅ Question classified as DIRECT');
console.log('🔍 Performing hybrid search...');
console.warn('⚠️  Classification failed, using fallback');
```

### 4. Async/Await

Always use async/await for asynchronous operations:

```javascript
// ✅ Good
const results = await vectorStore.similaritySearch(query);

// ❌ Bad
vectorStore.similaritySearch(query).then(results => { ... });
```

### 5. Default Parameters

Provide sensible defaults:

```javascript
async query(question, options = {}) {
    const {
        maxResults = 4,
        includeScores = false,
        minScore = 0.1
    } = options;
}
```

### 6. Metadata Enrichment

Always include rich metadata:

```javascript
{
    source: filename,
    chunkIndex: i,
    totalChunks: chunks.length,
    fileType: path.extname(filename).slice(1),
    processedAt: new Date().toISOString(),
    chunkSize: this.chunkSize
}
```

### 7. Score Normalization

Normalize scores to 0-1 range for consistency:

```javascript
const normalizedScore = (score - minScore) / (maxScore - minScore);
```

### 8. Conversation Context

Limit conversation history to prevent token overflow:

```javascript
const recentHistory = conversationHistory.slice(-10); // Last 5 turns
```

---

## Performance Considerations

### 1. Embedding Generation
- **Cost**: ~$0.0001 per 1K tokens
- **Optimization**: Batch process documents
- **Caching**: Store embeddings in FAISS

### 2. FAISS Search
- **Time Complexity**: O(log n) with HNSW
- **Memory**: ~6KB per 1536-dim vector
- **Optimization**: Use appropriate index type

### 3. LLM Calls
- **Latency**: 1-3 seconds per call
- **Cost**: ~$0.0015 per 1K tokens (GPT-4o-mini)
- **Optimization**: Use streaming for long responses

### 4. Hybrid Search
- **Trade-off**: Accuracy vs speed
- **Optimization**: Adjust maxResults and weights
- **Caching**: Cache frequent queries

---

## Troubleshooting

### Common Issues

**1. "OpenAI API key not found"**
- Check `.env` file
- Verify `OPENAI_API_KEY` is set
- Restart server after adding key

**2. "Vector store initialization failed"**
- Check disk space
- Verify write permissions on `vector_store/`
- Delete corrupted index and reinitialize

**3. "No relevant documents found"**
- Upload documents first
- Check if documents were processed correctly
- Lower `minScore` threshold

**4. "Tavily search unavailable"**
- Check `TAVILY_API_KEY` in `.env`
- Verify API key is valid
- Check network connectivity

**5. "Classification failed"**
- Check OpenAI API status
- Verify API key has sufficient credits
- System falls back to SEARCH mode automatically

---

## Summary

The `src/` directory implements a sophisticated RAG system with:

- **Intelligent document processing** with chunking and metadata
- **Hybrid search** combining keyword and semantic approaches
- **AI-powered classification** for optimal query routing
- **Multi-source search** (documents + web)
- **Conversation context** for natural interactions
- **Robust error handling** and fallback mechanisms

Each component is designed to work independently while integrating seamlessly into the overall system architecture.
