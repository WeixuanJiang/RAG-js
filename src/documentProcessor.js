const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { Document } = require('langchain/document');

class DocumentProcessor {
    constructor() {
        this.textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
    }

    async processDocument(filePath, originalName) {
        const fileExtension = path.extname(originalName).toLowerCase();
        let text = '';

        try {
            switch (fileExtension) {
                case '.pdf':
                    text = await this.processPDF(filePath);
                    break;
                case '.txt':
                    text = await this.processTXT(filePath);
                    break;
                case '.docx':
                    text = await this.processDOCX(filePath);
                    break;
                default:
                    throw new Error(`Unsupported file type: ${fileExtension}`);
            }

            // Check if text was extracted
            console.log(`Extracted text length for ${originalName}: ${text.length} characters`);
            if (text.length < 10) {
                console.log(`First 100 chars of extracted text: "${text.substring(0, 100)}"`);
            }
            
            // Handle empty or very short text
            if (!text || text.trim().length === 0) {
                throw new Error(`No readable text found in ${originalName}. The file might be empty, corrupted, or contain only images.`);
            }
            
            if (text.trim().length < 10) {
                throw new Error(`Very little text extracted from ${originalName} (${text.trim().length} characters). The file might contain mostly images or be corrupted.`);
            }

            // Split text into chunks
            const chunks = await this.textSplitter.splitText(text);
            
            // Create Document objects with metadata
            const documents = chunks.map((chunk, index) => {
                return new Document({
                    pageContent: chunk,
                    metadata: {
                        source: originalName,
                        chunkIndex: index,
                        totalChunks: chunks.length,
                        fileType: fileExtension,
                        processedAt: new Date().toISOString()
                    }
                });
            });

            console.log(`Processed ${originalName}: ${chunks.length} chunks created`);
            return documents;
        } catch (error) {
            console.error(`Error processing ${originalName}:`, error);
            throw new Error(`Failed to process document: ${error.message}`);
        }
    }

    async processPDF(filePath) {
        try {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            return data.text;
        } catch (error) {
            throw new Error(`PDF processing failed: ${error.message}`);
        }
    }

    async processTXT(filePath) {
        try {
            return fs.readFileSync(filePath, 'utf8');
        } catch (error) {
            throw new Error(`TXT processing failed: ${error.message}`);
        }
    }

    async processDOCX(filePath) {
        try {
            const result = await mammoth.extractRawText({ path: filePath });
            return result.value;
        } catch (error) {
            throw new Error(`DOCX processing failed: ${error.message}`);
        }
    }

    // Utility method to validate file
    validateFile(filePath, originalName) {
        if (!fs.existsSync(filePath)) {
            throw new Error('File does not exist');
        }

        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
            throw new Error('File is empty');
        }

        const allowedExtensions = ['.pdf', '.txt', '.docx'];
        const fileExtension = path.extname(originalName).toLowerCase();
        if (!allowedExtensions.includes(fileExtension)) {
            throw new Error(`Unsupported file type: ${fileExtension}`);
        }

        return true;
    }
}

module.exports = { DocumentProcessor };