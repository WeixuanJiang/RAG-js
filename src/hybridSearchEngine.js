const natural = require('natural');
const { TfIdf } = natural;

class HybridSearchEngine {
    constructor(vectorStore) {
        this.vectorStore = vectorStore;
        this.tfidf = new TfIdf();
        this.documents = [];
        this.documentMetadata = [];
        this.isIndexed = false;
    }

    /**
     * 构建BM25索引
     * @param {Array} documents - 文档数组，每个文档包含content和metadata
     */
    async buildIndex(documents) {
        console.log(`Building hybrid search index for ${documents.length} documents...`);
        
        this.documents = documents;
        this.documentMetadata = documents.map(doc => doc.metadata);
        
        // 清空现有索引
        this.tfidf = new TfIdf();
        
        // 为每个文档构建TF-IDF索引
        documents.forEach((doc, index) => {
            // 获取文档内容，支持不同的属性名
            const content = doc.pageContent || doc.content || '';
            // 预处理文本：转换为小写，移除标点符号
            const processedText = this.preprocessText(content);
            this.tfidf.addDocument(processedText);
        });
        
        this.isIndexed = true;
        console.log('Hybrid search index built successfully');
    }

    /**
     * 文本预处理
     * @param {string} text - 原始文本
     * @returns {string} - 处理后的文本
     */
    preprocessText(text) {
        // 添加空值检查
        if (!text || typeof text !== 'string') {
            return '';
        }
        
        return text
            .toLowerCase()
            .replace(/[^\w\s\u4e00-\u9fff]/g, ' ') // 保留英文、数字、空格和中文字符
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * BM25关键词搜索
     * @param {string} query - 查询字符串
     * @param {number} k - 返回结果数量
     * @returns {Array} - 搜索结果
     */
    async keywordSearch(query, k = 10) {
        if (!this.isIndexed) {
            console.warn('Index not built yet, returning empty results');
            return [];
        }

        const processedQuery = this.preprocessText(query);
        const queryTerms = processedQuery.split(' ').filter(term => term.length > 0);
        
        if (queryTerms.length === 0) {
            return [];
        }

        // 计算每个文档的BM25分数
        const scores = [];
        
        for (let i = 0; i < this.documents.length; i++) {
            let score = 0;
            
            queryTerms.forEach(term => {
                const tfidfScore = this.tfidf.tfidf(term, i);
                score += tfidfScore;
            });
            
            if (score > 0) {
                const content = this.documents[i].pageContent || this.documents[i].content || '';
                scores.push({
                    content: content,
                    metadata: this.documents[i].metadata,
                    score: score,
                    searchType: 'keyword'
                });
            }
        }
        
        // 按分数排序并返回前k个结果
        return scores
            .sort((a, b) => b.score - a.score)
            .slice(0, k);
    }

    /**
     * 语义搜索（使用现有的向量搜索）
     * @param {string} query - 查询字符串
     * @param {number} k - 返回结果数量
     * @returns {Array} - 搜索结果
     */
    async semanticSearch(query, k = 10) {
        try {
            const results = await this.vectorStore.similaritySearch(query, k);
            return results.map(result => ({
                ...result,
                searchType: 'semantic'
            }));
        } catch (error) {
            console.error('Semantic search failed:', error);
            return [];
        }
    }

    /**
     * 混合搜索：结合关键词搜索和语义搜索
     * @param {string} query - 查询字符串
     * @param {Object} options - 搜索选项
     * @returns {Array} - 融合后的搜索结果
     */
    async hybridSearch(query, options = {}) {
        const {
            maxResults = 4,
            keywordWeight = 0.3,
            semanticWeight = 0.7,
            keywordResults = 10,
            semanticResults = 10
        } = options;

        console.log(`Performing hybrid search for: "${query}"`);
        
        // 并行执行关键词搜索和语义搜索
        const [keywordSearchResults, semanticSearchResults] = await Promise.all([
            this.keywordSearch(query, keywordResults),
            this.semanticSearch(query, semanticResults)
        ]);

        console.log(`Keyword search found ${keywordSearchResults.length} results`);
        console.log(`Semantic search found ${semanticSearchResults.length} results`);

        // 融合结果
        const fusedResults = this.fuseResults(
            keywordSearchResults,
            semanticSearchResults,
            keywordWeight,
            semanticWeight
        );

        // 返回前maxResults个结果
        const finalResults = fusedResults.slice(0, maxResults);
        console.log(`Returning ${finalResults.length} fused results`);
        
        return finalResults;
    }

    /**
     * 结果融合算法（Reciprocal Rank Fusion）
     * @param {Array} keywordResults - 关键词搜索结果
     * @param {Array} semanticResults - 语义搜索结果
     * @param {number} keywordWeight - 关键词权重
     * @param {number} semanticWeight - 语义权重
     * @returns {Array} - 融合后的结果
     */
    fuseResults(keywordResults, semanticResults, keywordWeight, semanticWeight) {
        const resultMap = new Map();
        const k = 60; // RRF参数

        // 处理关键词搜索结果
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

        // 处理语义搜索结果
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

        // 按融合分数排序
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
     * 生成文档唯一标识
     * @param {Object} result - 搜索结果
     * @returns {string} - 文档ID
     */
    getDocumentId(result) {
        const metadata = result.metadata || {};
        return `${metadata.source || 'unknown'}_${metadata.chunkIndex || 0}`;
    }

    /**
     * 重建索引（当文档更新时调用）
     */
    async rebuildIndex() {
        if (this.documents.length > 0) {
            await this.buildIndex(this.documents);
        }
    }

    /**
     * 获取索引统计信息
     * @returns {Object} - 统计信息
     */
    getIndexStats() {
        return {
            isIndexed: this.isIndexed,
            documentCount: this.documents.length,
            vocabularySize: this.isIndexed ? Object.keys(this.tfidf.documents[0] || {}).length : 0
        };
    }
}

module.exports = { HybridSearchEngine };