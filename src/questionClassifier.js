const { ChatOpenAI } = require('@langchain/openai');
const { PromptTemplate } = require('@langchain/core/prompts');
const { RunnableSequence } = require('@langchain/core/runnables');
const { StringOutputParser } = require('@langchain/core/output_parsers');

class QuestionClassifier {
    constructor() {
        // Validate OpenAI API key
        if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
            throw new Error('OpenAI API key is required for question classification');
        }
        
        // Use a faster, cheaper model for classification
        this.llm = new ChatOpenAI({
            openAIApiKey: process.env.OPENAI_API_KEY,
            modelName: 'gpt-3.5-turbo',
            temperature: 0, // Deterministic for classification
            maxTokens: 10 // Very short response needed
        });
        
        this.classificationPrompt = PromptTemplate.fromTemplate(`
You are a question classifier. Classify the following question as either "DIRECT" or "SEARCH".

DIRECT: Questions that should be answered using the AI's general knowledge without searching documents or web:
- Personal questions about the AI ("What is your name?", "Who are you?", "你叫什么名字?")
- Greetings and casual conversation ("Hello", "How are you?", "你好")
- General knowledge questions ("What is gravity?", "Explain photosynthesis", "什么是重力?")
- Math calculations ("What is 2+2?", "Calculate 15*3")
- Simple factual questions that don't require specific documents
- Conversational responses

SEARCH: Questions that need to search documents or web for specific information:
- Questions about uploaded documents ("What does the document say about X?")
- Questions referring to specific files or content
- Questions asking for current/recent information
- Questions that explicitly mention documents, files, or sources
- Questions about specific companies, people, or events that need up-to-date info

Question: "{question}"

Classification (respond with only "DIRECT" or "SEARCH"): `);

        this.classificationChain = RunnableSequence.from([
            this.classificationPrompt,
            this.llm,
            new StringOutputParser()
        ]);
    }

    async classifyQuestion(question) {
        try {
            console.log(`Classifying question: "${question}"`);
            
            // Quick pattern-based fallback for very obvious cases
            if (this.isLikelyGreeting(question) || this.isPersonalQuestion(question)) {
                console.log(`Classification result: DIRECT (pattern-based)`);
                return 'DIRECT';
            }
            
            const classification = await this.classificationChain.invoke({
                question: question.trim()
            });
            
            console.log(`Raw classification response: "${classification}"`);
            
            // Clean up the response and ensure it's either DIRECT or SEARCH
            const cleanedClassification = classification.trim().toUpperCase();
            
            if (cleanedClassification.includes('DIRECT')) {
                console.log(`Classification result: DIRECT`);
                return 'DIRECT';
            } else if (cleanedClassification.includes('SEARCH')) {
                console.log(`Classification result: SEARCH`);
                return 'SEARCH';
            } else {
                // Default to SEARCH if unclear (safer for RAG system)
                console.log(`Classification unclear: "${classification}", defaulting to SEARCH`);
                return 'SEARCH';
            }
            
        } catch (error) {
            console.error('Question classification failed:', error.message);
            
            // Try pattern-based fallback on error
            if (this.isLikelyGreeting(question) || this.isPersonalQuestion(question)) {
                console.log('Using pattern-based fallback: DIRECT');
                return 'DIRECT';
            }
            
            // Default to SEARCH on error (safer for RAG system)
            console.log('Defaulting to SEARCH due to classification error');
            return 'SEARCH';
        }
    }

    /**
     * Batch classify multiple questions (for optimization if needed)
     * @param {Array} questions - Array of questions to classify
     * @returns {Array} - Array of classifications
     */
    async classifyQuestions(questions) {
        try {
            const classifications = await Promise.all(
                questions.map(question => this.classifyQuestion(question))
            );
            return classifications;
        } catch (error) {
            console.error('Batch classification failed:', error);
            // Return all SEARCH on error
            return questions.map(() => 'SEARCH');
        }
    }

    /**
     * Check if a question is likely a greeting or casual conversation
     * This is a quick fallback check that doesn't require LLM
     * @param {string} question 
     * @returns {boolean}
     */
    isLikelyGreeting(question) {
        const greetingPatterns = [
            /^(hi|hello|hey|你好|再见)$/i,
            /^(good morning|good afternoon|good evening)$/i,
            /^(how are you|how do you do)$/i,
            /^(thanks|thank you|谢谢)$/i
        ];
        
        return greetingPatterns.some(pattern => pattern.test(question.trim()));
    }

    /**
     * Check if a question is about the AI itself
     * @param {string} question 
     * @returns {boolean}
     */
    isPersonalQuestion(question) {
        const personalPatterns = [
            /what.*your.*name/i,
            /who.*are.*you/i,
            /你叫什么名字/i,
            /你是谁/i,
            /what.*can.*you.*do/i,
            /tell.*about.*yourself/i
        ];
        
        return personalPatterns.some(pattern => pattern.test(question));
    }
}

module.exports = { QuestionClassifier };