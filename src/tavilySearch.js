const { TavilySearch } = require('@langchain/tavily');
const { Tool } = require('langchain/tools');

class TavilySearchRun extends Tool {
    constructor(config = {}) {
        super();
        this.name = 'tavily_search';
        this.description = 'Search the web using Tavily for recent information and web results';
        this.maxResults = config.maxResults || 5;
        this.searchDepth = config.searchDepth || 'basic';
        this.includeImages = config.includeImages || false;
        this.includeAnswer = config.includeAnswer || false;
        
        // Validate API key
        if (!process.env.TAVILY_API_KEY || process.env.TAVILY_API_KEY === 'your_tavily_api_key_here') {
            console.warn('⚠️  Warning: Tavily API key not configured!');
            console.warn('   Please set TAVILY_API_KEY in your .env file.');
            console.warn('   You can get an API key from: https://tavily.com/');
            throw new Error('TAVILY_API_KEY environment variable is required. Get your key from https://tavily.com/');
        }
        
        this.tavilyTool = new TavilySearch({
            maxResults: this.maxResults,
            searchDepth: this.searchDepth,
            includeImages: this.includeImages,
            includeAnswer: this.includeAnswer
        });
    }

    async _call(query) {
        try {
            console.log(`Tavily search called with query: "${query}"`);
            const response = await this.tavilyTool.invoke({ query });
            console.log('Tavily raw response:', JSON.stringify(response, null, 2));
            
            if (!response) {
                return 'No results found for the query.';
            }

            // Parse the results if they're in string format
            let parsedResponse;
            if (typeof response === 'string') {
                try {
                    parsedResponse = JSON.parse(response);
                } catch (e) {
                    console.error('Failed to parse Tavily response:', e);
                    return response; // Return as-is if can't parse
                }
            } else {
                parsedResponse = response;
            }
            
            // Extract results array from Tavily response
            const results = parsedResponse.results || [];
            
            if (results.length === 0) {
                return 'No results found for the query.';
            }
            
            return results.slice(0, this.maxResults).map((result, index) => 
                `${index + 1}. **${result.title || 'No title'}**\n   ${result.content || 'No description'}\n   Source: ${result.url || 'No URL'}`
            ).join('\n\n');
            
        } catch (error) {
            console.error('Tavily search error:', error);
            return `Search failed: ${error.message}`;
        }
    }
}

class TavilySearchResults extends Tool {
    constructor(config = {}) {
        super();
        this.name = 'tavily_search_results';
        this.description = 'Get detailed search results from Tavily including snippets and URLs';
        this.maxResults = config.maxResults || 5;
        this.searchDepth = config.searchDepth || 'basic';
        this.includeImages = config.includeImages || false;
        this.includeAnswer = config.includeAnswer || false;
        
        // Validate API key
        if (!process.env.TAVILY_API_KEY || process.env.TAVILY_API_KEY === 'your_tavily_api_key_here') {
            console.warn('⚠️  Warning: Tavily API key not configured!');
            console.warn('   Please set TAVILY_API_KEY in your .env file.');
            console.warn('   You can get an API key from: https://tavily.com/');
            throw new Error('TAVILY_API_KEY environment variable is required. Get your key from https://tavily.com/');
        }
        
        this.tavilyTool = new TavilySearch({
            maxResults: this.maxResults,
            searchDepth: this.searchDepth,
            includeImages: this.includeImages,
            includeAnswer: this.includeAnswer
        });
    }

    async _call(query) {
        try {
            console.log(`Tavily search results called with query: "${query}"`);
            const response = await this.tavilyTool.invoke({ query });
            console.log('Tavily results raw response:', JSON.stringify(response, null, 2));
            
            if (!response) {
                return [];
            }

            // Parse the results if they're in string format
            let parsedResponse;
            if (typeof response === 'string') {
                try {
                    parsedResponse = JSON.parse(response);
                } catch (e) {
                    console.error('Failed to parse Tavily response:', e);
                    return [];
                }
            } else {
                parsedResponse = response;
            }
            
            // Extract results array from Tavily response
            const results = parsedResponse.results || [];
            
            if (results.length === 0) {
                return [];
            }
            
            return results.slice(0, this.maxResults).map(result => ({
                title: result.title || '',
                snippet: result.content || '',
                url: result.url || '',
                source: 'Tavily Search',
                type: 'web',
                publishedDate: null, // Tavily doesn't provide publish date
                score: result.score || 1.0
            }));
            
        } catch (error) {
            console.error('Tavily search error:', error);
            return [];
        }
    }
}

class TavilySearchAPIWrapper {
    constructor(config = {}) {
        this.maxResults = config.maxResults || 5;
        this.searchDepth = config.searchDepth || 'basic';
        this.includeImages = config.includeImages || false;
        this.includeAnswer = config.includeAnswer || false;
        
        // Validate API key
        if (!process.env.TAVILY_API_KEY || process.env.TAVILY_API_KEY === 'your_tavily_api_key_here') {
            console.warn('⚠️  Warning: Tavily API key not configured!');
            console.warn('   Please set TAVILY_API_KEY in your .env file.');
            console.warn('   You can get an API key from: https://tavily.com/');
            throw new Error('TAVILY_API_KEY environment variable is required. Get your key from https://tavily.com/');
        }
        
        this.tavilyTool = new TavilySearch({
            maxResults: this.maxResults,
            searchDepth: this.searchDepth,
            includeImages: this.includeImages,
            includeAnswer: this.includeAnswer
        });
    }

    async search(query, options = {}) {
        try {
            const maxResults = options.maxResults || this.maxResults;
            
            console.log(`Tavily API wrapper search called with query: "${query}", maxResults: ${maxResults}`);
            
            // Update tool config if needed
            if (maxResults !== this.maxResults) {
                this.tavilyTool = new TavilySearch({
                    maxResults: maxResults,
                    searchDepth: this.searchDepth,
                    includeImages: this.includeImages,
                    includeAnswer: this.includeAnswer
                });
            }
            
            const response = await this.tavilyTool.invoke({ query });
            console.log('Tavily API wrapper raw response:', JSON.stringify(response, null, 2));
            
            if (!response) {
                return [];
            }

            // Parse the results if they're in string format
            let parsedResponse;
            if (typeof response === 'string') {
                try {
                    parsedResponse = JSON.parse(response);
                } catch (e) {
                    console.error('Failed to parse Tavily response:', e);
                    return [];
                }
            } else {
                parsedResponse = response;
            }
            
            // Extract results array from Tavily response
            const results = parsedResponse.results || [];
            
            return results.slice(0, maxResults);
        } catch (error) {
            console.error('Tavily API wrapper error:', error);
            throw error;
        }
    }

    async searchWithMetadata(query, options = {}) {
        try {
            const results = await this.search(query, options);
            
            return results.map(result => ({
                content: result.content || result.snippet || '',
                metadata: {
                    title: result.title || '',
                    url: result.url || '',
                    source: 'Tavily Web Search',
                    type: 'web',
                    publishedDate: result.published_date || null,
                    searchQuery: query,
                    score: result.score || 1.0
                }
            }));
        } catch (error) {
            console.error('Tavily search with metadata error:', error);
            return [];
        }
    }
}

module.exports = {
    TavilySearchRun,
    TavilySearchResults,
    TavilySearchAPIWrapper
};