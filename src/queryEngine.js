const { ChatOpenAI } = require('@langchain/openai');
const { PromptTemplate } = require('@langchain/core/prompts');
const { RunnableSequence } = require('@langchain/core/runnables');
const { StringOutputParser } = require('@langchain/core/output_parsers');
const { HybridSearchEngine } = require('./hybridSearchEngine');
const { TavilySearchAPIWrapper } = require('./tavilySearch');
const { QuestionClassifier } = require('./questionClassifier');

class QueryEngine {
    constructor(vectorStore) {
        // Validate OpenAI API key
        if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
            throw new Error('OpenAI API key is required. Please set OPENAI_API_KEY in your .env file.');
        }

        this.vectorStore = vectorStore;
        this.hybridSearchEngine = new HybridSearchEngine(vectorStore);

        // Initialize question classifier
        try {
            this.questionClassifier = new QuestionClassifier();
            console.log('✅ Question classifier initialized successfully');
        } catch (error) {
            console.warn('⚠️  Question classifier initialization failed:', error.message);
            console.warn('   All questions will be treated as search queries.');
            console.warn('   Make sure OPENAI_API_KEY is properly configured.');
            this.questionClassifier = null;
        }
        // Initialize Tavily search with error handling
        try {
            this.tavilySearch = new TavilySearchAPIWrapper({
                maxResults: 5,
                searchDepth: process.env.TAVILY_SEARCH_DEPTH || 'basic',
                includeImages: process.env.TAVILY_INCLUDE_IMAGES === 'true' || false
            });
        } catch (error) {
            console.warn('⚠️  Tavily search initialization failed:', error.message);
            console.warn('   Web search functionality will be disabled.');
            this.tavilySearch = null;
        }
        this.llm = new ChatOpenAI({
            openAIApiKey: process.env.OPENAI_API_KEY,
            modelName: 'gpt-4o-mini',
            temperature: 0.1,
        });

        // Direct query prompt template (for questions that don't need search)
        this.directPromptTemplate = PromptTemplate.fromTemplate(`
You are a friendly AI assistant. Answer the user's question directly using your general knowledge.
Respond in the same language as the user's question. For Chinese questions, answer in Chinese.
For greetings and casual conversations, respond warmly and appropriately.

DO NOT reference any documents, sources, or search results. Answer based on your training knowledge onlt.
Be conversational and natural in your responses.

Conversation History:
{conversationHistory}

Question: {question}

Answer: 
`);

        // Search-based query prompt template (for questions that need context)
        this.searchPromptTemplate = PromptTemplate.fromTemplate(`
You are a helpful and friendly AI assistant. Answer the user's question using the provided context.
Respond in the same language as the user's question. For Chinese questions, answer in Chinese.

Use the context provided to answer the question. Do NOT include source references or citations in your answer.
If the context is not relevant to the question, say so and answer based on your general knowledge.
If you don't know the answer based on the provided context, just say that you don't know, don't try to make up an answer.
Consider the conversation history to provide more contextual and relevant answers.

Conversation History:
{conversationHistory}

Context:
{context}

Question: {question}

Answer: 
`);

        // Keep unified template for backward compatibility
        this.unifiedPromptTemplate = this.searchPromptTemplate;
        this.generalPromptTemplate = this.directPromptTemplate;

        // Create chains for different types of queries
        this.directChain = RunnableSequence.from([
            this.directPromptTemplate,
            this.llm,
            new StringOutputParser()
        ]);

        this.searchChain = RunnableSequence.from([
            this.searchPromptTemplate,
            this.llm,
            new StringOutputParser()
        ]);

        // Keep general chain for backward compatibility
        this.generalChain = this.directChain;
    }

    async query(question, options = {}) {
        try {
            const {
                maxResults = 4,
                includeScores = false,
                minScore = 0.1,
                conversationHistory = [],
                forceSearchMode = false // Option to force search mode
            } = options;

            console.log(`Processing query: "${question}"`);

            // Classify the question unless forced to search mode
            if (!forceSearchMode && this.questionClassifier) {
                try {
                    const classification = await this.questionClassifier.classifyQuestion(question);

                    if (classification === 'DIRECT') {
                        console.log('✅ Question classified as DIRECT - using AI knowledge directly');
                        return await this.directQuery(question, { conversationHistory });
                    }

                    console.log('🔍 Question classified as SEARCH - proceeding with vector search');
                } catch (error) {
                    console.warn('⚠️  Classification failed, falling back to search mode:', error.message);
                }
            } else {
                if (!this.questionClassifier) {
                    console.log('⚠️  Using search mode (classifier unavailable)');
                } else {
                    console.log('🔍 Using search mode (forced)');
                }
            }

            // Get relevant documents from vector store
            const searchResults = await this.vectorStore.similaritySearch(question, maxResults);

            // Log search results for debugging
            console.log(`Search results for "${question}":`, searchResults.map(r => ({ score: r.score, preview: r.content.substring(0, 50) })));

            // Filter by minimum score if specified
            const filteredResults = searchResults.filter(result =>
                result.score >= minScore
            );

            console.log(`Filtered results: ${filteredResults.length}/${searchResults.length} (minScore: ${minScore})`);

            // If no relevant documents found or all scores are too low, use general LLM
            if (searchResults.length === 0 || filteredResults.length === 0) {
                console.log('No relevant documents found, using general LLM response...');

                // Format conversation history
                const formattedHistory = this.formatConversationHistory(conversationHistory);

                // Generate answer using general LLM chain
                const answer = await this.generalChain.invoke({
                    question: question,
                    conversationHistory: formattedHistory
                });

                return {
                    text: answer,
                    sources: [],
                    searchResults: includeScores ? searchResults : []
                };
            }

            // Prepare context from search results
            const context = this.formatContext(filteredResults);

            // Format conversation history
            const formattedHistory = this.formatConversationHistory(conversationHistory);

            // Generate answer using the search chain
            console.log('Generating answer with LLM using search context...');
            const answer = await this.searchChain.invoke({
                context: context,
                question: question,
                conversationHistory: formattedHistory
            });

            // Extract unique sources
            const sources = this.extractSources(filteredResults);

            console.log(`Answer generated. Used ${sources.length} source(s).`);

            return {
                text: answer,
                sources: sources,
                searchResults: includeScores ? filteredResults : []
            };

        } catch (error) {
            console.error('Query processing failed:', error);
            throw new Error(`Query failed: ${error.message}`);
        }
    }

    /**
     * Direct query method - answers questions using AI's knowledge, but also provides relevant sources for reference
     * @param {string} question - The question to answer
     * @param {Object} options - Query options
     * @returns {Object} - Direct answer with relevant sources for reference
     */
    async directQuery(question, options = {}) {
        try {
            const { conversationHistory = [], maxResults = 3 } = options;

            console.log(`Processing DIRECT query: "${question}"`);

            // Format conversation history
            const formattedHistory = this.formatConversationHistory(conversationHistory);

            // Generate answer using direct chain (no context)
            const answer = await this.directChain.invoke({
                question: question,
                conversationHistory: formattedHistory
            });

            console.log('Direct answer generated using AI knowledge');

            // Even for direct answers, try to find relevant sources for user reference
            let sources = [];
            let searchResults = [];
            try {
                if (this.documentsCount > 0) {
                    const relevantDocs = await this.vectorStore.similaritySearch(question, maxResults);
                    if (relevantDocs.length > 0) {
                        // Filter only moderately relevant documents (score > 0.3) for reference
                        const filteredDocs = relevantDocs.filter(result => result.score > 0.3);
                        if (filteredDocs.length > 0) {
                            sources = this.extractSources(filteredDocs);
                            searchResults = filteredDocs;
                            console.log(`Found ${sources.length} reference source(s) for direct answer`);
                        }
                    }
                }
            } catch (sourceError) {
                console.warn('Failed to get reference sources for direct answer:', sourceError.message);
                // Continue without sources - not critical for direct answers
            }

            return {
                text: answer,
                sources: sources, // Include relevant sources for reference
                searchResults: searchResults,
                queryType: 'direct'
            };

        } catch (error) {
            console.error('Direct query processing failed:', error);
            throw new Error(`Direct query failed: ${error.message}`);
        }
    }

    formatContext(searchResults) {
        return searchResults.map((result, index) => {
            const source = result.metadata.source || 'Unknown';
            const chunkIndex = result.metadata.chunkIndex || 0;

            return `Document ${index + 1} (Source: ${source}, Chunk: ${chunkIndex + 1}):
${result.content}
`;
        }).join('\n---\n\n');
    }

    extractSources(searchResults) {
        console.log('=== EXTRACT SOURCES DEBUG START ===');
        console.log('Input length:', searchResults.length);
        if (searchResults.length > 0) {
            console.log('First result:', JSON.stringify(searchResults[0], null, 2));
        }
        const sourceMap = new Map();

        searchResults.forEach(result => {
            const source = result.metadata.source || 'Unknown';
            const chunkIndex = result.metadata.chunkIndex || 0;
            const score = result.score;
            const content = result.content || result.pageContent || '';

            console.log('Debug - processing result:', {
                source,
                chunkIndex,
                score,
                contentLength: content.length,
                contentPreview: content.substring(0, 100)
            });

            if (!sourceMap.has(source)) {
                sourceMap.set(source, {
                    filename: source,
                    chunks: [],
                    fileType: result.metadata.fileType || 'unknown',
                    processedAt: result.metadata.processedAt
                });
            }

            sourceMap.get(source).chunks.push({
                chunkIndex: chunkIndex + 1,
                score: score,
                content: content
            });
        });

        const finalResult = Array.from(sourceMap.values()).map(source => ({
            ...source,
            chunks: source.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex)
        }));

        console.log('Debug - extractSources output:', JSON.stringify(finalResult, null, 2));
        return finalResult;
    }

    /**
     * 构建混合搜索索引
     * @param {Array} documents - 文档数组
     */
    async buildHybridIndex(documents) {
        try {
            console.log('Building hybrid search index...');
            await this.hybridSearchEngine.buildIndex(documents, this.vectorStore);
            console.log('Hybrid search index built successfully');
        } catch (error) {
            console.error('Failed to build hybrid index:', error);
            throw new Error(`Hybrid index build failed: ${error.message}`);
        }
    }

    /**
     * 混合查询：结合关键词搜索和语义搜索
     * @param {string} question - 查询问题
     * @param {Object} options - 查询选项
     * @returns {Object} - 查询结果
     */
    async hybridQuery(question, options = {}) {
        try {
            const {
                maxResults = 4,
                includeScores = false,
                minScore = 0.01,
                keywordWeight = 0.3,
                semanticWeight = 0.7,
                searchType = 'hybrid', // 'hybrid', 'semantic', 'keyword'
                conversationHistory = []
            } = options;

            console.log(`Processing hybrid query: "${question}" (type: ${searchType})`);

            let searchResults = [];

            // 根据搜索类型选择不同的搜索策略
            switch (searchType) {
                case 'keyword':
                    searchResults = await this.hybridSearchEngine.keywordSearch(question, maxResults * 2);
                    break;
                case 'semantic':
                    searchResults = await this.hybridSearchEngine.semanticSearch(question, maxResults * 2);
                    break;
                case 'hybrid':
                default:
                    searchResults = await this.hybridSearchEngine.hybridSearch(question, {
                        maxResults: maxResults * 2,
                        keywordWeight,
                        semanticWeight
                    });
                    break;
            }

            if (searchResults.length === 0) {
                return {
                    text: "I don't have any relevant information in my knowledge base to answer your question. Please upload some documents first.",
                    sources: [],
                    searchResults: [],
                    searchType: searchType
                };
            }

            // 过滤低分结果
            const filteredResults = searchResults.filter(result =>
                result.score >= minScore
            );

            // If no relevant documents found or all scores are too low, use general LLM
            if (searchResults.length === 0 || filteredResults.length === 0) {
                console.log('No relevant documents found in hybrid search, using general LLM response...');

                // Format conversation history
                const formattedHistory = this.formatConversationHistory(conversationHistory);

                // Generate answer using general LLM chain
                const answer = await this.generalChain.invoke({
                    question: question,
                    conversationHistory: formattedHistory
                });

                return {
                    text: answer,
                    sources: [],
                    searchResults: includeScores ? searchResults : [],
                    searchType: searchType,
                    searchStats: {
                        totalResults: searchResults.length,
                        filteredResults: 0,
                        finalResults: 0
                    }
                };
            }

            // 取前maxResults个结果
            const finalResults = filteredResults.slice(0, maxResults);

            // 准备上下文
            const context = this.formatHybridContext(finalResults);

            // 格式化对话历史
            const formattedHistory = this.formatConversationHistory(conversationHistory);

            // 使用LLM生成答案
            console.log('Generating answer with LLM using hybrid search results...');
            const answer = await this.generalChain.invoke({
                context: context,
                question: question,
                conversationHistory: formattedHistory
            });

            // 提取来源
            console.log('Debug - About to call extractSources with finalResults:', finalResults.length);
            const sources = this.extractSources(finalResults);

            console.log(`Hybrid answer generated. Used ${sources.length} source(s) from ${searchType} search.`);
            console.log('Debug - Final sources structure:', JSON.stringify(sources, null, 2));

            return {
                text: answer,
                sources: sources,
                searchResults: includeScores ? finalResults : [],
                searchType: searchType,
                searchStats: {
                    totalResults: searchResults.length,
                    filteredResults: filteredResults.length,
                    finalResults: finalResults.length
                }
            };

        } catch (error) {
            console.error('Hybrid query processing failed:', error);
            throw new Error(`Hybrid query failed: ${error.message}`);
        }
    }

    /**
     * 格式化混合搜索的上下文
     * @param {Array} searchResults - 搜索结果
     * @returns {string} - 格式化的上下文
     */
    formatHybridContext(searchResults) {
        return searchResults.map((result, index) => {
            const source = result.metadata.source || 'Unknown';
            const chunkIndex = result.metadata.chunkIndex || 0;
            const searchInfo = this.getSearchInfo(result);

            return `Document ${index + 1} (Source: ${source}, Chunk: ${chunkIndex + 1}${searchInfo}):
${result.content}
`;
        }).join('\n---\n\n');
    }

    /**
     * 获取搜索信息字符串
     * @param {Object} result - 搜索结果
     * @returns {string} - 搜索信息
     */
    getSearchInfo(result) {
        const info = [];

        if (result.searchType) {
            info.push(`Type: ${result.searchType}`);
        }

        if (result.keywordRank) {
            info.push(`Keyword Rank: ${result.keywordRank}`);
        }

        if (result.semanticRank) {
            info.push(`Semantic Rank: ${result.semanticRank}`);
        }

        return info.length > 0 ? `, ${info.join(', ')}` : '';
    }

    /**
     * 获取混合搜索引擎统计信息
     * @returns {Object} - 统计信息
     */
    getHybridSearchStats() {
        return this.hybridSearchEngine.getIndexStats();
    }

    /**
     * 格式化对话历史
     * @param {Array} conversationHistory - 对话历史数组
     * @returns {string} - 格式化的对话历史
     */
    formatConversationHistory(conversationHistory) {
        if (!conversationHistory || conversationHistory.length === 0) {
            return "No previous conversation.";
        }

        // 只保留最近的5轮对话以避免上下文过长
        const recentHistory = conversationHistory.slice(-10); // 5轮对话 = 10条消息

        return recentHistory.map(msg => {
            const role = msg.role === 'user' ? 'User' : 'Assistant';
            return `${role}: ${msg.content}`;
        }).join('\n');
    }

    /**
     * Web search query using Tavily
     * @param {string} question - The search query
     * @param {Object} options - Search options
     * @returns {Object} - Search results with AI-generated answer
     */
    async webSearchQuery(question, options = {}) {
        try {
            const {
                maxResults = 5,
                includeAnswer = true,
                conversationHistory = [],
                backend = 'web'
            } = options;

            console.log(`Processing web search query: "${question}"`);

            // Check if Tavily search is available
            if (!this.tavilySearch) {
                return {
                    text: "Web search is currently unavailable. Please check your Tavily API key configuration.",
                    sources: [],
                    searchResults: [],
                    searchType: 'web',
                    error: 'Tavily API key not configured'
                };
            }

            // Configure search wrapper
            this.tavilySearch.maxResults = maxResults;

            // Perform web search
            const webResults = await this.tavilySearch.searchWithMetadata(question);

            if (webResults.length === 0) {
                return {
                    text: "No web results found for your query.",
                    sources: [],
                    searchResults: [],
                    searchType: 'web'
                };
            }

            // Format web results as context
            const webContext = webResults.map((result, index) => {
                const title = result.metadata.title;
                const url = result.metadata.url;
                const content = result.content;

                return `Web Result ${index + 1}:
Title: ${title}
URL: ${url}
Content: ${content}`;
            }).join('\n\n---\n\n');

            let answer = '';
            if (includeAnswer) {
                // Format conversation history
                const formattedHistory = this.formatConversationHistory(conversationHistory);

                // Generate answer using web search results
                const webSearchPrompt = PromptTemplate.fromTemplate(`
You are a helpful AI assistant. Answer the user's question based on web search results.
Do NOT include source URLs or citations in your answer. Focus on providing clear, accurate information.
If the web results don't contain relevant information, say so clearly.

Conversation History:
{conversationHistory}

Web Search Results:
{context}

Question: {question}

Answer:
`);

                const webSearchChain = RunnableSequence.from([
                    webSearchPrompt,
                    this.llm,
                    new StringOutputParser()
                ]);

                answer = await webSearchChain.invoke({
                    context: webContext,
                    question: question,
                    conversationHistory: formattedHistory
                });
            }

            // Format sources for frontend display
            const sources = [{
                filename: 'Tavily Web Search',
                chunks: webResults.map((result, index) => ({
                    chunkIndex: index + 1,
                    score: result.metadata.score || 1.0,
                    content: result.content,
                    metadata: result.metadata
                })),
                fileType: 'web',
                processedAt: new Date().toISOString()
            }];

            console.log(`Web search completed. Found ${webResults.length} results.`);

            return {
                text: answer || webContext,
                sources: sources,
                searchResults: webResults,
                searchType: 'web',
                searchStats: {
                    totalResults: webResults.length,
                    searchDepth: this.tavilySearch.searchDepth
                }
            };

        } catch (error) {
            console.error('Web search query failed:', error);
            throw new Error(`Web search failed: ${error.message}`);
        }
    }

    /**
     * Combined query: Web search + Document search
     * @param {string} question - The search query
     * @param {Object} options - Search options
     * @returns {Object} - Combined results with AI-generated answer
     */
    async combinedSearchQuery(question, options = {}) {
        try {
            const {
                maxWebResults = 3,
                maxDocResults = 3,
                conversationHistory = [],
                webWeight = 0.5,
                docWeight = 0.5,
                searchType = 'hybrid'  // Default to hybrid, but allow override
            } = options;

            console.log(`Processing combined search query: "${question}" (searchType: ${searchType})`);

            // Check if Tavily search is available for web search
            if (!this.tavilySearch) {
                console.warn('Tavily search not available, falling back to document search only');
                return await this.hybridQuery(question, {
                    maxResults: maxDocResults,
                    searchType: searchType  // Use the passed searchType
                });
            }

            // Perform both searches in parallel
            const [webSearchResult, docSearchResult] = await Promise.all([
                this.webSearchQuery(question, {
                    maxResults: maxWebResults,
                    includeAnswer: false
                }),
                this.hybridQuery(question, {
                    maxResults: maxDocResults,
                    searchType: searchType,  // Use the passed searchType
                    includeScores: true  // Include search results for logging and stats
                })
            ]);

            // Combine contexts
            const webContext = webSearchResult.searchResults.map((result, index) =>
                `Web Source ${index + 1} (${result.metadata.title}): ${result.content}`
            ).join('\n\n');

            const docContext = docSearchResult.searchResults && docSearchResult.searchResults.length > 0
                ? this.formatContext(docSearchResult.searchResults)
                : '';

            const combinedContext = `
WEB SEARCH RESULTS:
${webContext}

DOCUMENT KNOWLEDGE BASE:
${docContext || 'No relevant documents found in knowledge base.'}
`;

            // Format conversation history
            const formattedHistory = this.formatConversationHistory(conversationHistory);

            // Generate combined answer
            const combinedPrompt = PromptTemplate.fromTemplate(`
You are a helpful AI assistant with access to both web search results and a document knowledge base.
Answer the user's question using information from both sources when relevant.
Do NOT include source URLs or document names in your answer. Focus on providing clear, comprehensive information.
If one source type doesn't contain relevant information, rely on the other.

Conversation History:
{conversationHistory}

Combined Context:
{context}

Question: {question}

Answer:
`);

            const combinedChain = RunnableSequence.from([
                combinedPrompt,
                this.llm,
                new StringOutputParser()
            ]);

            const answer = await combinedChain.invoke({
                context: combinedContext,
                question: question,
                conversationHistory: formattedHistory
            });

            // Combine sources
            const allSources = [
                ...webSearchResult.sources,
                ...docSearchResult.sources
            ];

            console.log(`Combined search completed. Web: ${webSearchResult.searchResults.length}, Docs: ${docSearchResult.searchResults?.length || 0}`);

            return {
                text: answer,
                sources: allSources,
                searchResults: {
                    web: webSearchResult.searchResults,
                    documents: docSearchResult.searchResults || []
                },
                searchType: 'combined',
                searchStats: {
                    webResults: webSearchResult.searchResults.length,
                    docResults: docSearchResult.searchResults?.length || 0,
                    totalResults: webSearchResult.searchResults.length + (docSearchResult.searchResults?.length || 0)
                }
            };

        } catch (error) {
            console.error('Combined search query failed:', error);
            throw new Error(`Combined search failed: ${error.message}`);
        }
    }
}

module.exports = { QueryEngine };