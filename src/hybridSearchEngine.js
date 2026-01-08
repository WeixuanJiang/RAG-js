const { Document } = require('@langchain/core/documents');
const { BaseRetriever } = require('@langchain/core/retrievers');
const natural = require('natural');
const { TfIdf } = natural;

/**
 * Custom BM25 Retriever compatible with LangChain
 */
class BM25Retriever extends BaseRetriever {
    constructor(documents, k = 4) {
        super();
        this.documents = documents;
        this.k = k;
        this.tfidf = new TfIdf();
        this._buildIndex();
    }

    _buildIndex() {
        this.documents.forEach(doc => {
            const content = doc.pageContent || doc.content || '';
            const processedText = this._preprocessText(content);
            this.tfidf.addDocument(processedText);
        });
    }

    _preprocessText(text) {
        if (!text || typeof text !== 'string') {
            return '';
        }
        return text
            .toLowerCase()
            .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    async _getRelevantDocuments(query) {
        const processedQuery = this._preprocessText(query);
        const queryTerms = processedQuery.split(' ').filter(term => term.length > 0);

        if (queryTerms.length === 0) {
            return [];
        }

        const scores = [];
        for (let i = 0; i < this.documents.length; i++) {
            let score = 0;
            queryTerms.forEach(term => {
                score += this.tfidf.tfidf(term, i);
            });

            if (score > 0) {
                scores.push({ index: i, score });
            }
        }

        return scores
            .sort((a, b) => b.score - a.score)
            .slice(0, this.k)
            .map(item => this.documents[item.index]);
    }
}

/**
 * Ensemble Retriever that combines multiple retrievers using RRF
 */
class EnsembleRetriever extends BaseRetriever {
    constructor(retrievers, weights) {
        super();
        this.retrievers = retrievers;
        this.weights = weights || retrievers.map(() => 1.0 / retrievers.length);
    }

    async _getRelevantDocuments(query) {
        // Get results from all retrievers
        const allResults = await Promise.all(
            this.retrievers.map(retriever => retriever.getRelevantDocuments(query))
        );

        // Apply Reciprocal Rank Fusion
        const k = 60;
        const resultMap = new Map();

        allResults.forEach((results, retrieverIndex) => {
            const weight = this.weights[retrieverIndex];
            results.forEach((doc, rank) => {
                const docId = this._getDocumentId(doc);
                const rrfScore = weight / (k + rank + 1);

                if (resultMap.has(docId)) {
                    resultMap.get(docId).score += rrfScore;
                } else {
                    resultMap.set(docId, { doc, score: rrfScore });
                }
            });
        });

        // Sort by score and return documents
        return Array.from(resultMap.values())
            .sort((a, b) => b.score - a.score)
            .map(item => item.doc);
    }

    _getDocumentId(doc) {
        const metadata = doc.metadata || {};
        return `${metadata.source || 'unknown'}_${metadata.chunkIndex || 0}`;
    }
}

class HybridSearchEngine {
    constructor(vectorStore) {
        this.vectorStore = vectorStore;
        this.bm25Retriever = null;
        this.ensembleRetriever = null;
        this.documents = [];
        this.isIndexed = false;
    }

    /**
     * Build BM25 and ensemble retriever index
     * @param {Array} documents - Array of documents with content and metadata
     * @param {Object} vectorStore - The vector store instance to use for semantic search
     */
    async buildIndex(documents, vectorStore) {
        console.log(`Building hybrid search index for ${documents.length} documents...`);

        // Store documents and vectorStore for later use
        this.documents = documents;
        this.vectorStore = vectorStore;

        // Convert documents to LangChain Document format if needed
        const langchainDocs = documents.map(doc => {
            if (doc instanceof Document) {
                return doc;
            }
            return new Document({
                pageContent: doc.pageContent || doc.content || '',
                metadata: doc.metadata || {}
            });
        });

        // Create BM25 retriever with the documents
        this.bm25Retriever = new BM25Retriever(langchainDocs, 10);

        // Create vector store retriever
        const vectorRetriever = vectorStore.asRetriever();

        // Create ensemble retriever combining BM25 and vector search
        // Default weights: 0.3 for BM25, 0.7 for vector search
        this.ensembleRetriever = new EnsembleRetriever(
            [this.bm25Retriever, vectorRetriever],
            [0.3, 0.7]
        );

        this.isIndexed = true;
        console.log('Hybrid search index built successfully');
    }

    /**
     * BM25 keyword search
     * @param {string} query - Query string
     * @param {number} k - Number of results to return
     * @returns {Array} - Search results
     */
    async keywordSearch(query, k = 10) {
        if (!this.isIndexed || !this.bm25Retriever) {
            console.warn('Index not built yet, returning empty results');
            return [];
        }

        try {
            // Set k for this retriever instance
            this.bm25Retriever.k = k;

            // Get documents from BM25 retriever
            const results = await this.bm25Retriever.getRelevantDocuments(query);

            // Convert to our expected format
            return results.map((doc, index) => ({
                content: doc.pageContent,
                metadata: doc.metadata,
                score: 1.0 / (index + 1), // Approximate score based on rank
                searchType: 'keyword'
            }));
        } catch (error) {
            console.error('Keyword search failed:', error);
            return [];
        }
    }

    /**
     * Semantic search using vector store
     * @param {string} query - Query string
     * @param {number} k - Number of results to return
     * @returns {Array} - Search results
     */
    async semanticSearch(query, k = 10) {
        try {
            const results = await this.vectorStore.similaritySearch(query, k);
            return results.map(result => ({
                content: result.pageContent || result.content,
                metadata: result.metadata,
                score: result.score || 0,
                searchType: 'semantic'
            }));
        } catch (error) {
            console.error('Semantic search failed:', error);
            return [];
        }
    }

    /**
     * Hybrid search combining keyword and semantic search
     * @param {string} query - Query string
     * @param {Object} options - Search options
     * @returns {Array} - Fused search results
     */
    async hybridSearch(query, options = {}) {
        const {
            maxResults = 4,
            keywordWeight = 0.3,
            semanticWeight = 0.7
        } = options;

        console.log(`Performing hybrid search for: "${query}"`);

        if (!this.isIndexed || !this.ensembleRetriever) {
            console.warn('Index not built yet, falling back to semantic search only');
            const results = await this.semanticSearch(query, maxResults);
            return results.map(r => ({ ...r, searchType: 'hybrid' }));
        }

        try {
            // Update ensemble retriever weights if provided
            if (keywordWeight !== 0.3 || semanticWeight !== 0.7) {
                this.ensembleRetriever = new EnsembleRetriever(
                    [this.bm25Retriever, this.vectorStore.asRetriever()],
                    [keywordWeight, semanticWeight]
                );
            }

            // Set k for BM25 retriever
            this.bm25Retriever.k = maxResults * 2;

            // Get results from ensemble retriever
            const results = await this.ensembleRetriever.getRelevantDocuments(query);

            // Convert to our expected format and limit results
            const formattedResults = results.slice(0, maxResults).map((doc, index) => ({
                content: doc.pageContent,
                metadata: doc.metadata,
                score: 1.0 / (index + 1), // Approximate score based on rank
                searchType: 'hybrid'
            }));

            console.log(`Returning ${formattedResults.length} hybrid search results`);
            return formattedResults;

        } catch (error) {
            console.error('Hybrid search failed:', error);
            // Fallback to semantic search
            const results = await this.semanticSearch(query, maxResults);
            return results.map(r => ({ ...r, searchType: 'hybrid' }));
        }
    }

    /**
     * Legacy method for backward compatibility
     * Results fusion using Reciprocal Rank Fusion (RRF)
     * Note: This is now handled internally by EnsembleRetriever
     */
    fuseResults(keywordResults, semanticResults, keywordWeight, semanticWeight) {
        const resultMap = new Map();
        const k = 60; // RRF parameter

        // Process keyword search results
        keywordResults.forEach((result, index) => {
            const docId = this.getDocumentId(result);
            const rrfScore = keywordWeight / (k + index + 1);

            if (resultMap.has(docId)) {
                const existing = resultMap.get(docId);
                existing.fusedScore += rrfScore;
                existing.keywordRank = index + 1;
                existing.keywordScore = result.score;
            } else {
                resultMap.set(docId, {
                    ...result,
                    fusedScore: rrfScore,
                    keywordRank: index + 1,
                    keywordScore: result.score,
                    semanticRank: null,
                    semanticScore: null
                });
            }
        });

        // Process semantic search results
        semanticResults.forEach((result, index) => {
            const docId = this.getDocumentId(result);
            const rrfScore = semanticWeight / (k + index + 1);

            if (resultMap.has(docId)) {
                const existing = resultMap.get(docId);
                existing.fusedScore += rrfScore;
                existing.semanticRank = index + 1;
                existing.semanticScore = result.score;
            } else {
                resultMap.set(docId, {
                    ...result,
                    fusedScore: rrfScore,
                    keywordRank: null,
                    keywordScore: null,
                    semanticRank: index + 1,
                    semanticScore: result.score
                });
            }
        });

        // Sort by fused score
        return Array.from(resultMap.values())
            .sort((a, b) => b.fusedScore - a.fusedScore)
            .map(result => ({
                content: result.content,
                metadata: result.metadata,
                score: result.fusedScore,
                keywordRank: result.keywordRank,
                keywordScore: result.keywordScore,
                semanticRank: result.semanticRank,
                semanticScore: result.semanticScore,
                searchType: 'hybrid'
            }));
    }

    /**
     * Generate unique document identifier
     * @param {Object} result - Search result
     * @returns {string} - Document ID
     */
    getDocumentId(result) {
        const metadata = result.metadata || {};
        return `${metadata.source || 'unknown'}_${metadata.chunkIndex || 0}`;
    }

    /**
     * Rebuild index when documents are updated
     */
    async rebuildIndex() {
        if (this.documents.length > 0 && this.vectorStore) {
            await this.buildIndex(this.documents, this.vectorStore);
        }
    }

    /**
     * Get index statistics
     * @returns {Object} - Statistics
     */
    getIndexStats() {
        return {
            isIndexed: this.isIndexed,
            documentCount: this.documents.length,
            hasEnsembleRetriever: this.ensembleRetriever !== null,
            hasBM25Retriever: this.bm25Retriever !== null
        };
    }
}

module.exports = { HybridSearchEngine };