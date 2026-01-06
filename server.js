const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Check OpenAI API key
if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
    console.warn('⚠️  Warning: OpenAI API key not configured!');
    console.warn('   Server will start in limited mode.');
    console.warn('   Please set OPENAI_API_KEY in your .env file with a valid OpenAI API key.');
    console.warn('   You can get an API key from: https://platform.openai.com/api-keys');
}

const { DocumentProcessor } = require('./src/documentProcessor');
const { VectorStore } = require('./src/vectorStore');
const { QueryEngine } = require('./src/queryEngine');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Create uploads directory if it doesn't exist
const uploadsDir = './uploads';
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.pdf', '.txt', '.docx'];
        const fileExt = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(fileExt)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF, TXT, and DOCX files are allowed'));
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Initialize components
const documentProcessor = new DocumentProcessor();
const vectorStore = new VectorStore();
const queryEngine = new QueryEngine(vectorStore);

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Upload and process document
app.post('/upload', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log('Processing file:', req.file.originalname);
        
        // Process the document
        const chunks = await documentProcessor.processDocument(req.file.path, req.file.originalname);
        
        // Add to vector store
        await vectorStore.addDocuments(chunks);
        
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        
        res.json({ 
            message: 'Document uploaded and processed successfully',
            filename: req.file.originalname,
            chunks: chunks.length
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Query the knowledge base (with intelligent classification)
app.post('/query', async (req, res) => {
    try {
        const { question, options = {}, conversationHistory = [] } = req.body;
        
        if (!question) {
            return res.status(400).json({ error: 'Question is required' });
        }

        console.log('Processing query:', question);
        
        // Respect frontend settings for includeScores and other options
        const queryOptions = {
            conversationHistory: conversationHistory,
            ...options
        };
        
        const answer = await queryEngine.query(question, queryOptions);
        
        res.json({ 
            question,
            answer: answer.text,
            sources: answer.sources,
            searchType: answer.queryType || 'search',
            searchResults: answer.searchResults || []
        });
    } catch (error) {
        console.error('Query error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Direct query endpoint (force direct AI response)
app.post('/direct-query', async (req, res) => {
    try {
        const { question, conversationHistory = [] } = req.body;
        
        if (!question) {
            return res.status(400).json({ error: 'Question is required' });
        }

        console.log('Processing direct query:', question);
        
        const answer = await queryEngine.directQuery(question, { conversationHistory });
        
        res.json({ 
            question,
            answer: answer.text,
            sources: answer.sources,
            searchType: 'direct',
            searchResults: answer.searchResults || []
        });
    } catch (error) {
        console.error('Direct query error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Hybrid search endpoint
app.post('/hybrid-query', async (req, res) => {
    try {
        const { question, options = {}, conversationHistory = [] } = req.body;
        
        if (!question) {
            return res.status(400).json({ error: 'Question is required' });
        }

        console.log('Processing hybrid query:', question);
        
        // Check if this should be a direct response instead of search
        if (queryEngine.questionClassifier && !options.forceSearchMode) {
            try {
                const classification = await queryEngine.questionClassifier.classifyQuestion(question);
                
                if (classification === 'DIRECT') {
                    console.log('✅ Hybrid query question classified as DIRECT - using AI knowledge directly');
                    const directAnswer = await queryEngine.directQuery(question, { conversationHistory });
                    
                    return res.json({
                        question,
                        answer: directAnswer.text,
                        sources: directAnswer.sources,
                        searchType: 'direct',
                        searchResults: directAnswer.searchResults || []
                    });
                }
                
                console.log('🔍 Hybrid query question classified as SEARCH - proceeding with hybrid search');
            } catch (classificationError) {
                console.warn('⚠️  Classification failed in hybrid query, proceeding with search:', classificationError.message);
            }
        }
        
        // Use hybrid search with default options, respecting frontend settings
        const searchOptions = {
            searchType: 'hybrid',
            maxResults: 4,
            conversationHistory: conversationHistory,
            ...options // Let frontend settings override defaults
        };
        
        const answer = await queryEngine.hybridQuery(question, searchOptions);
        
        res.json({ 
            question,
            answer: answer.text,
            sources: answer.sources,
            searchType: answer.searchType || 'hybrid',
            searchResults: answer.searchResults || [],
            searchStats: answer.searchStats || null
        });
    } catch (error) {
        console.error('Hybrid query error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Web search endpoint (Tavily)
app.post('/web-search', async (req, res) => {
    try {
        const { question, options = {}, conversationHistory = [] } = req.body;
        
        if (!question) {
            return res.status(400).json({ error: 'Question is required' });
        }

        console.log('Processing web search:', question);
        
        // Check if this should be a direct response instead of search
        if (queryEngine.questionClassifier && !options.forceSearchMode) {
            try {
                const classification = await queryEngine.questionClassifier.classifyQuestion(question);
                
                if (classification === 'DIRECT') {
                    console.log('✅ Web search question classified as DIRECT - using AI knowledge directly');
                    const directAnswer = await queryEngine.directQuery(question, { conversationHistory });
                    
                    return res.json({
                        question,
                        answer: directAnswer.text,
                        sources: directAnswer.sources,
                        searchType: 'direct',
                        searchResults: directAnswer.searchResults || []
                    });
                }
                
                console.log('🔍 Web search question classified as SEARCH - proceeding with web search');
            } catch (classificationError) {
                console.warn('⚠️  Classification failed in web search, proceeding with search:', classificationError.message);
            }
        }
        
        const searchOptions = {
            maxResults: options.maxResults || 5,
            backend: options.backend || 'web',
            conversationHistory: conversationHistory,
            ...options
        };
        
        const answer = await queryEngine.webSearchQuery(question, searchOptions);
        
        res.json({ 
            question,
            answer: answer.text,
            sources: answer.sources,
            searchType: 'web',
            searchResults: answer.searchResults || [],
            searchStats: answer.searchStats || null
        });
    } catch (error) {
        console.error('Web search error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Combined search endpoint (Web + Documents)
app.post('/combined-search', async (req, res) => {
    try {
        const { question, options = {}, conversationHistory = [] } = req.body;
        
        if (!question) {
            return res.status(400).json({ error: 'Question is required' });
        }

        console.log('Processing combined search:', question);
        
        // Check if this should be a direct response instead of search
        if (queryEngine.questionClassifier && !options.forceSearchMode) {
            try {
                const classification = await queryEngine.questionClassifier.classifyQuestion(question);
                
                if (classification === 'DIRECT') {
                    console.log('✅ Combined search question classified as DIRECT - using AI knowledge directly');
                    const directAnswer = await queryEngine.directQuery(question, { conversationHistory });
                    
                    return res.json({
                        question,
                        answer: directAnswer.text,
                        sources: directAnswer.sources,
                        searchType: 'direct',
                        searchResults: directAnswer.searchResults || []
                    });
                }
                
                console.log('🔍 Combined search question classified as SEARCH - proceeding with search');
            } catch (classificationError) {
                console.warn('⚠️  Classification failed in combined search, proceeding with search:', classificationError.message);
            }
        }
        
        const searchOptions = {
            maxWebResults: options.maxWebResults || 3,
            maxDocResults: options.maxDocResults || 3,
            conversationHistory: conversationHistory,
            ...options
        };
        
        const answer = await queryEngine.combinedSearchQuery(question, searchOptions);
        
        res.json({ 
            question,
            answer: answer.text,
            sources: answer.sources,
            searchType: 'combined',
            searchResults: answer.searchResults || {},
            searchStats: answer.searchStats || null
        });
    } catch (error) {
        console.error('Combined search error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get vector store status
app.get('/status', async (req, res) => {
    try {
        const status = await vectorStore.getStatus();
        res.json(status);
    } catch (error) {
        console.error('Status error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Clear vector store
app.delete('/clear', async (req, res) => {
    try {
        await vectorStore.clear();
        res.json({ message: 'Vector store cleared successfully' });
    } catch (error) {
        console.error('Clear error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
        }
    }
    res.status(500).json({ error: error.message });
});

// Initialize vector store and start server
async function startServer() {
    try {
        await vectorStore.initialize();
        console.log('Vector store initialized');
    } catch (error) {
        console.warn('⚠️  Warning: Vector store initialization failed:', error.message);
        console.warn('   Server will start in limited mode.');
    }
    
    app.listen(PORT, () => {
        console.log(`RAG Server running on http://localhost:${PORT}`);
        console.log('Upload documents and start querying!');
    });
}

startServer();