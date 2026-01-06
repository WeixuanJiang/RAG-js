# RAG Knowledge Base with JavaScript

A complete Retrieval-Augmented Generation (RAG) application built with JavaScript, LangChain, and OpenAI. This application allows users to upload documents and ask questions to get AI-powered answers based on the uploaded content.

## Features

- **Document Upload**: Support for PDF, TXT, and DOCX files
- **Hybrid Search**: Advanced search combining keyword and semantic similarity
- **Vector Storage**: Uses FAISS for efficient similarity search
- **AI-Powered Answers**: Leverages OpenAI's GPT models for generating responses
- **Unified PROMPT System**: Single intelligent template handling both document queries and casual conversations
- **Multi-language Support**: Automatic language detection with native Chinese greeting support
- **Smart Context Routing**: Automatically switches between document-based and general AI responses
- **Modern UI**: Clean, responsive web interface with detailed source information
- **Chat History**: Keeps track of previous questions and answers
- **Real-time Status**: Shows knowledge base statistics
- **Drag & Drop**: Easy file upload with drag and drop support
- **Detailed Sources**: View chunk content, scores, and search rankings
- **Search Analytics**: Comprehensive search statistics and performance metrics

## Prerequisites

- Node.js (v16 or higher)
- OpenAI API key

## Installation

1. **Clone or download the project**
   ```bash
   cd ragjs
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   - Copy `.env.example` to `.env`
   - Add your OpenAI API key:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   PORT=3000
   VECTOR_STORE_PATH=./vector_store
   ```

4. **Start the application**
   ```bash
   npm start
   ```
   
   For development with auto-restart:
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to `http://localhost:3000`

## Usage

### 1. Upload Documents
- Click "Choose Files" or drag and drop files into the upload area
- Supported formats: PDF, TXT, DOCX (max 10MB each)
- Files are automatically processed and added to the knowledge base

### 2. Ask Questions
- Type your question in the query box
- Choose search type: Vector (semantic), Keyword, or Hybrid (recommended)
- Click "Ask Question" or press Ctrl+Enter
- Get AI-powered answers based on your uploaded documents
- View detailed search analytics and performance metrics

### 3. View Sources
- Each answer includes detailed source references
- See which documents and chunks were used to generate the answer
- View actual chunk content and metadata (file type, processing time)
- Analyze search scores, rankings, and search type (keyword/semantic/hybrid)
- Review search statistics including total, filtered, and final results

### 4. Manage Knowledge Base
- View status: number of documents, last update time
- Clear knowledge base: remove all uploaded documents
- Chat history: review previous questions and answers

## API Endpoints

### Upload Document
```
POST /upload
Content-Type: multipart/form-data

Body: document file
```

### Query Knowledge Base (Vector Search)
```
POST /query
Content-Type: application/json

Body:
{
  "question": "Your question here",
  "options": {
    "maxResults": 4,
    "includeScores": true
  }
}
```

### Hybrid Query (Advanced Search)
```
POST /hybrid-query
Content-Type: application/json

Body:
{
  "question": "Your question here",
  "options": {
    "maxResults": 4,
    "includeScores": true,
    "minScore": 0.1,
    "keywordWeight": 0.3,
    "semanticWeight": 0.7,
    "searchType": "hybrid"
  }
}
```

### Get Status
```
GET /status
```

### Clear Knowledge Base
```
DELETE /clear
```

## Project Structure

```
ragjs/
├── src/
│   ├── documentProcessor.js    # Document parsing and chunking
│   ├── vectorStore.js          # FAISS vector storage management
│   ├── queryEngine.js          # RAG query processing
│   └── hybridSearchEngine.js   # Hybrid search with keyword + semantic
├── public/
│   ├── index.html              # Main web interface
│   ├── style.css               # Styling
│   └── script.js               # Frontend JavaScript
├── uploads/                    # Temporary file storage
├── vector_store/               # FAISS vector database
├── server.js                   # Express server
├── package.json                # Dependencies
├── .env.example                # Environment template
└── README.md                   # This file
```

## Configuration

### Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key (required)
- `PORT`: Server port (default: 3000)
- `VECTOR_STORE_PATH`: Path to store vector database (default: ./vector_store)

### PROMPT Customization

The system uses a unified PROMPT template that can be customized for different response types:

- **Unified PROMPT System**: Single intelligent template handling both document queries and casual conversations
- **Multi-language Support**: Automatic language detection with native response matching
- **Context Routing**: Configurable sensitivity for switching between document-based and general AI responses
- **Response Templates**: Customizable templates for different query types and languages

### Document Processing

- **Chunk Size**: 1000 characters
- **Chunk Overlap**: 200 characters
- **Max File Size**: 10MB
- **Supported Formats**: PDF, TXT, DOCX

### Search Configuration

- **Search Types**: Vector, Keyword, Hybrid (combined)
- **Hybrid Weights**: Configurable keyword vs semantic balance
- **Score Filtering**: Minimum relevance threshold
- **Ranking Algorithm**: Reciprocal Rank Fusion (RRF) for hybrid search
- **Result Limits**: Configurable maximum results per query

### AI Models

- **Embeddings**: text-embedding-ada-002
- **Chat Model**: gpt-3.5-turbo
- **Temperature**: 0.1 (for consistent answers)
- **Unified PROMPT**: Single template handling both document-based and general queries
- **Multi-language Support**: Automatic language detection and response matching

### Enhanced UI Features

- **Detailed Source Display**: Each source shows file type, processing time, and chunk information
- **Search Analytics**: Real-time display of search statistics and performance metrics
- **Chunk Content Viewer**: View the actual text content of each retrieved chunk
- **Search Type Indicators**: Visual indicators for keyword, semantic, or hybrid search results
- **Score Visualization**: Color-coded relevance scores and ranking information
- **Responsive Design**: Optimized for desktop and mobile viewing
- **Interactive Elements**: Expandable sections and hover effects for better UX

## Troubleshooting

### Common Issues

1. **"OpenAI API key not found"**
   - Make sure you've created a `.env` file with your API key
   - Verify the API key is correct and has sufficient credits

2. **"Failed to initialize vector store"**
   - Check if the vector_store directory has write permissions
   - Ensure sufficient disk space

3. **"File upload failed"**
   - Verify file format is supported (PDF, TXT, DOCX)
   - Check file size is under 10MB
   - Ensure the uploads directory exists and is writable

4. **"Query failed"**
   - Make sure documents have been uploaded first
   - Check OpenAI API key and credits
   - Verify network connectivity

5. **"Hybrid search not working"**
   - Ensure documents are properly indexed
   - Check if search weights are configured correctly
   - Verify minimum score threshold is not too high

6. **"No search results displayed"**
   - Check if includeScores is set to true in query options
   - Verify the frontend is receiving searchResults data
   - Ensure search statistics are being returned by the backend

### Performance Tips

- For large documents, consider splitting them into smaller files
- The vector store is persistent - uploaded documents remain after restart
- Clear the knowledge base periodically to improve performance
- Use specific questions for better results

## Development

### Adding New File Types

1. Update the `documentProcessor.js` to handle new formats
2. Add the MIME type to the upload validation
3. Install any required parsing libraries

### Customizing the AI Model

1. Modify the model configuration in `queryEngine.js`
2. Adjust temperature, max tokens, or other parameters
3. Update the prompt template for different response styles

### Customizing Search Parameters

1. **Hybrid Search Weights**: Adjust `keywordWeight` and `semanticWeight` in query options
2. **Score Thresholds**: Modify `minScore` to filter low-relevance results
3. **Search Types**: Choose between 'vector', 'keyword', or 'hybrid' search modes
4. **Result Limits**: Configure `maxResults` for optimal performance
5. **RRF Parameters**: Tune Reciprocal Rank Fusion settings in `hybridSearchEngine.js`

### Extending the API

1. Add new routes in `server.js`
2. Implement corresponding frontend functions in `script.js`
3. Update the UI as needed

## License

MIT License - feel free to use this project for your own applications.

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.