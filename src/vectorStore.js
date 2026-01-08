const { FaissStore } = require('@langchain/community/vectorstores/faiss');
const { OpenAIEmbeddings } = require('@langchain/openai');
const { HybridSearchEngine } = require('./hybridSearchEngine');
const fs = require('fs');
const path = require('path');

class VectorStore {
    constructor() {
        // Validate OpenAI API key
        if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
            throw new Error('OpenAI API key is required. Please set OPENAI_API_KEY in your .env file.');
        }

        this.embeddings = new OpenAIEmbeddings({
            openAIApiKey: process.env.OPENAI_API_KEY,
            modelName: 'text-embedding-ada-002'
        });
        this.vectorStore = null;
        this.storePath = process.env.VECTOR_STORE_PATH || './vector_store';
        this.documentsCount = 0;
        this.lastUpdated = 'Never';
        this.isInitialized = false;
        this.initializationError = null;
        this.hybridSearchEngine = new HybridSearchEngine();
    }

    async initialize() {
        try {
            // Check if vector store exists
            if (fs.existsSync(this.storePath)) {
                console.log('Loading existing vector store...');
                this.vectorStore = await FaissStore.load(this.storePath, this.embeddings);
                // Get document count and last updated from metadata if available
                const metadataPath = path.join(this.storePath, 'metadata.json');
                if (fs.existsSync(metadataPath)) {
                    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                    this.documentsCount = metadata.documentsCount || 0;
                    this.lastUpdated = metadata.lastUpdated || 'Never';
                }
                console.log(`Vector store loaded with ${this.documentsCount} documents`);
            } else {
                console.log('Creating new vector store...');
                // Create empty vector store
                this.vectorStore = await FaissStore.fromTexts(
                    ['dummy initialization text'], // Dummy text to initialize
                    [{ source: 'init', type: 'dummy' }],
                    this.embeddings
                );
                await this.saveVectorStore();
                console.log('New vector store created');
            }
            this.isInitialized = true;
        } catch (error) {
            console.error('Vector store initialization failed:', error);
            console.warn('⚠️  Server will start in limited mode. Please check your OpenAI API key.');
            console.warn('   Features requiring embeddings will not be available.');
            this.isInitialized = false;
            this.initializationError = error.message;
        }
    }

    async addDocuments(documents) {
        try {
            if (!this.isInitialized) {
                throw new Error(`Vector store not available: ${this.initializationError || 'Initialization failed'}`);
            }

            if (!this.vectorStore) {
                throw new Error('Vector store not initialized');
            }

            if (!documents || documents.length === 0) {
                throw new Error('No documents provided');
            }

            console.log(`Adding ${documents.length} document chunks to vector store...`);

            // Add documents to the vector store
            await this.vectorStore.addDocuments(documents);

            // Build hybrid search index with the new documents
            await this.hybridSearchEngine.buildIndex(documents, this.vectorStore);

            // Update document count and last updated time
            this.documentsCount += documents.length;
            this.lastUpdated = new Date().toISOString();

            // Save the updated vector store
            await this.saveVectorStore();

            console.log(`Successfully added ${documents.length} chunks. Total: ${this.documentsCount}`);
            console.log('Hybrid search index updated');

            return {
                added: documents.length,
                total: this.documentsCount
            };
        } catch (error) {
            console.error('Error adding documents:', error);
            throw new Error(`Failed to add documents: ${error.message}`);
        }
    }

    async similaritySearch(query, k = 4) {
        try {
            if (!this.isInitialized) {
                throw new Error(`Vector store not available: ${this.initializationError || 'Initialization failed'}`);
            }

            if (!this.vectorStore) {
                throw new Error('Vector store not initialized');
            }

            if (this.documentsCount === 0) {
                return [];
            }

            console.log(`Searching for: "${query}" (top ${k} results)`);

            const results = await this.vectorStore.similaritySearchWithScore(query, k);

            // Filter out dummy initialization document
            const filteredResults = results.filter(([doc, score]) =>
                doc.metadata.type !== 'dummy'
            );

            console.log(`Found ${filteredResults.length} relevant documents`);

            return filteredResults.map(([doc, score]) => ({
                content: doc.pageContent,
                metadata: doc.metadata,
                score: score
            }));
        } catch (error) {
            console.error('Similarity search failed:', error);
            throw new Error(`Search failed: ${error.message}`);
        }
    }

    async saveVectorStore() {
        try {
            if (!this.vectorStore) {
                throw new Error('Vector store not initialized');
            }

            // Ensure directory exists
            if (!fs.existsSync(this.storePath)) {
                fs.mkdirSync(this.storePath, { recursive: true });
            }

            // Save vector store
            await this.vectorStore.save(this.storePath);

            // Save metadata
            const metadata = {
                documentsCount: this.documentsCount,
                lastUpdated: this.lastUpdated,
                embeddingModel: 'text-embedding-ada-002'
            };

            const metadataPath = path.join(this.storePath, 'metadata.json');
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

            console.log('Vector store saved successfully');
        } catch (error) {
            console.error('Error saving vector store:', error);
            throw new Error(`Failed to save vector store: ${error.message}`);
        }
    }

    async clear() {
        try {
            console.log('Starting vector store clear operation...');

            // Reset instance variables first to ensure consistent state
            this.documentsCount = 0;
            this.lastUpdated = 'Never';
            this.vectorStore = null;
            this.isInitialized = false;
            this.initializationError = null;

            // Remove vector store directory with better error handling
            if (fs.existsSync(this.storePath)) {
                try {
                    // On Windows, sometimes files are locked, so try multiple times
                    let retries = 3;
                    while (retries > 0) {
                        try {
                            fs.rmSync(this.storePath, { recursive: true, force: true });
                            console.log('Vector store files deleted successfully');
                            break;
                        } catch (deleteError) {
                            retries--;
                            if (retries > 0) {
                                console.warn(`Deletion failed, retrying... (${retries} attempts left)`);
                                // Wait a bit before retrying
                                await new Promise(resolve => setTimeout(resolve, 100));
                            } else {
                                throw deleteError;
                            }
                        }
                    }
                } catch (deleteError) {
                    console.error('Failed to delete vector store files:', deleteError);
                    // Continue anyway - reset the state even if file deletion fails
                    console.warn('Continuing with state reset despite file deletion failure');
                }
            }

            // Try to reinitialize with empty store
            try {
                await this.initialize();
                console.log('Vector store cleared and reinitialized successfully');
            } catch (initError) {
                console.warn('Vector store cleared but could not reinitialize:', initError.message);
                console.warn('This may be due to API key configuration issues');
                // Don't throw here - clearing succeeded even if reinit failed
                this.isInitialized = false;
                this.initializationError = initError.message;
            }

            console.log('Vector store clear operation completed');
            return {
                message: 'Vector store cleared successfully',
                documentsCount: this.documentsCount,
                lastUpdated: this.lastUpdated
            };
        } catch (error) {
            console.error('Error clearing vector store:', error);
            throw new Error(`Failed to clear vector store: ${error.message}`);
        }
    }

    async getStatus() {
        try {
            return {
                initialized: this.isInitialized, // Changed from isInitialized to initialized for frontend compatibility
                documentsCount: this.documentsCount,
                lastUpdated: this.lastUpdated, // Use instance variable directly
                storePath: this.storePath,
                storeExists: fs.existsSync(this.storePath),
                error: this.initializationError || null,
                message: this.isInitialized ? 'Vector store is ready' : 'Vector store unavailable - check OpenAI API key'
            };
        } catch (error) {
            console.error('Error getting vector store status:', error);
            return {
                initialized: false,
                documentsCount: 0,
                lastUpdated: 'Never',
                error: error.message,
                message: 'Error retrieving status'
            };
        }
    }
}

module.exports = { VectorStore };