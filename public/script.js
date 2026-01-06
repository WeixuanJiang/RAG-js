// Global variables
let chatHistory = [];
let conversationHistory = []; // 新增：用于存储对话历史
let isProcessing = false;
let isTyping = false; // 新增：用于跟踪AI是否正在输入

// DOM elements
const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const uploadProgress = document.getElementById('uploadProgress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const chatMessages = document.getElementById('chatMessages');
const loadingOverlay = document.getElementById('loadingOverlay');
const toastContainer = document.getElementById('toastContainer');
// These elements may not exist in current HTML, so handle them safely
const chatHistorySection = document.getElementById('chatHistory');
const chatContainer = document.getElementById('chatContainer');
const resultsSection = document.getElementById('resultsSection');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    updateStatus();
});

// Initialize event listeners
function initializeEventListeners() {
    // File upload events
    const selectFileBtn = document.getElementById('selectFileBtn');
    selectFileBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent event bubbling
        fileInput.click();
    });
    uploadArea.addEventListener('click', (e) => {
        // Only trigger if clicking on the upload area itself, not the button
        if (e.target !== selectFileBtn && !selectFileBtn.contains(e.target)) {
            fileInput.click();
        }
    });
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    fileInput.addEventListener('change', handleFileSelect);
    
    // Chat events
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Auto-resize textarea
    messageInput.addEventListener('input', autoResizeTextarea);
    
    // Search mode change listener
    const searchModeSelect = document.getElementById('searchMode');
    if (searchModeSelect) {
        searchModeSelect.addEventListener('change', handleSearchModeChange);
    }
    
    // Load chat history on page load
    loadChatHistory();
}

// Toggle sidebar
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('open');
    }
}

// Handle search mode change
function handleSearchModeChange() {
    const searchMode = document.getElementById('searchMode').value;
    const searchTypeLabel = document.querySelector('label:has(#searchType)');
    const webBackendLabel = document.getElementById('webBackendLabel');
    
    if (searchMode === 'web') {
        // Hide document search type, show web backend options
        if (searchTypeLabel) searchTypeLabel.style.display = 'none';
        if (webBackendLabel) webBackendLabel.style.display = 'block';
    } else if (searchMode === 'documents') {
        // Show document search type, hide web backend options
        if (searchTypeLabel) searchTypeLabel.style.display = 'block';
        if (webBackendLabel) webBackendLabel.style.display = 'none';
    } else {
        // Combined mode: show document search type, hide web backend
        if (searchTypeLabel) searchTypeLabel.style.display = 'block';
        if (webBackendLabel) webBackendLabel.style.display = 'none';
    }
}

// Auto-resize textarea
function autoResizeTextarea() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
}

// File handling functions
function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    if (files.length > 0) {
        uploadFiles(files);
    }
}

function handleDragOver(event) {
    event.preventDefault();
    uploadArea.classList.add('dragover');
}

function handleDragLeave(event) {
    event.preventDefault();
    uploadArea.classList.remove('dragover');
}

function handleDrop(event) {
    event.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
        uploadFiles(files);
    }
}

// Upload files function
async function uploadFiles(files) {
    if (isProcessing) {
        showToast('Please wait for the current operation to complete', 'warning');
        return;
    }
    
    // Validate files
    const validFiles = files.filter(file => {
        const validTypes = ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        const validExtensions = ['.pdf', '.txt', '.docx'];
        const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
        
        if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
            showToast(`Invalid file type: ${file.name}`, 'error');
            return false;
        }
        
        if (file.size > 10 * 1024 * 1024) {
            showToast(`File too large: ${file.name} (max 10MB)`, 'error');
            return false;
        }
        
        return true;
    });
    
    if (validFiles.length === 0) {
        return;
    }
    
    isProcessing = true;
    uploadProgress.style.display = 'block';
    
    let successCount = 0;
    let totalFiles = validFiles.length;
    
    for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        
        try {
            progressText.textContent = `Uploading ${file.name} (${i + 1}/${totalFiles})...`;
            progressFill.style.width = `${((i + 0.5) / totalFiles) * 100}%`;
            
            await uploadSingleFile(file);
            successCount++;
            
            progressFill.style.width = `${((i + 1) / totalFiles) * 100}%`;
            
        } catch (error) {
            console.error('Upload error:', error);
            showToast(`Failed to upload ${file.name}: ${error.message}`, 'error');
        }
    }
    
    // Reset UI
    setTimeout(() => {
        uploadProgress.style.display = 'none';
        progressFill.style.width = '0%';
        isProcessing = false;
        
        if (successCount > 0) {
            // Only clear file input if at least one file was successfully uploaded
            fileInput.value = '';
            showToast(`Successfully uploaded ${successCount} file(s)`, 'success');
            updateStatus();
        } else {
            // If no files were uploaded successfully, keep the file selection
            showToast('No files were uploaded successfully. Please try again.', 'error');
        }
    }, 1000);
}

// Upload single file
function uploadSingleFile(file) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('document', file);
        
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                // Update progress within the current file's allocation
            }
        });
        
        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                resolve(response);
            } else {
                const error = JSON.parse(xhr.responseText);
                reject(new Error(error.error || 'Upload failed'));
            }
        });
        
        xhr.addEventListener('error', () => {
            reject(new Error('Network error during upload'));
        });
        
        xhr.open('POST', '/upload');
        xhr.send(formData);
    });
}

// Send message function
async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) {
        return;
    }
    
    if (isProcessing) {
        showToast('请等待AI回复完成', 'warning');
        return;
    }
    
    // Add user message to chat
    addUserMessage(message);
    
    // Clear input
    messageInput.value = '';
    autoResizeTextarea();
    
    // Disable send button
    sendBtn.disabled = true;
    isProcessing = true;
    
    // Show typing indicator
    showTypingIndicator();
    
    try {
        const includeScores = document.getElementById('includeScores')?.checked || false;
        const maxResults = parseInt(document.getElementById('maxResults')?.value || '5');
        const searchType = document.getElementById('searchType')?.value || 'vector';
        const searchMode = document.getElementById('searchMode')?.value || 'combined';
        const webBackend = document.getElementById('webBackend')?.value || 'web';
        
        let endpoint, requestBody;
        
        if (searchMode === 'web') {
            // Web search only
            endpoint = '/web-search';
            requestBody = {
                question: message,
                options: {
                    maxResults: maxResults,
                    backend: webBackend
                },
                conversationHistory: conversationHistory
            };
        } else if (searchMode === 'combined') {
            // Combined search (web + documents)
            endpoint = '/combined-search';
            requestBody = {
                question: message,
                options: {
                    maxWebResults: Math.ceil(maxResults / 2),
                    maxDocResults: Math.ceil(maxResults / 2)
                },
                conversationHistory: conversationHistory
            };
        } else {
            // Documents search (original behavior)
            endpoint = searchType === 'hybrid' ? '/hybrid-query' : '/query';
            requestBody = {
                question: message,
                options: {
                    includeScores: includeScores,
                    maxResults: maxResults,
                    searchType: searchType
                },
                conversationHistory: conversationHistory
            };
        }
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Remove typing indicator
        removeTypingIndicator();
        
        // Add bot response to chat
        addBotMessage(data);
        
        // Update conversation history
        conversationHistory.push({
            role: 'user',
            content: message
        });
        conversationHistory.push({
            role: 'assistant',
            content: data.answer
        });
        
        // Keep only last 10 exchanges (20 messages)
        if (conversationHistory.length > 20) {
            conversationHistory = conversationHistory.slice(-20);
        }
        
        // Add to chat history for persistence
        addToChatHistory(message, data.answer, data.sources, data.searchType || searchType);
        
    } catch (error) {
        console.error('Query error:', error);
        removeTypingIndicator();
        addErrorMessage('抱歉，处理您的问题时出现错误：' + error.message);
        showToast('处理消息时出错：' + error.message, 'error');
    } finally {
        isProcessing = false;
        sendBtn.disabled = false;
    }
}

// Add user message to chat
function addUserMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'user-message';
    messageDiv.innerHTML = `
        <div class="message-content">
            ${escapeHtml(message).replace(/\n/g, '<br>')}
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

// Add bot message to chat
function addBotMessage(data) {
    console.log('=== FRONTEND DEBUG START ===');
    console.log('Received data:', JSON.stringify(data, null, 2));
    console.log('Data sources:', data.sources);
    if (data.sources && data.sources.length > 0) {
        console.log('First source chunks:', data.sources[0].chunks);
        if (data.sources[0].chunks && data.sources[0].chunks.length > 0) {
            console.log('First chunk content:', data.sources[0].chunks[0].content);
        }
    }
    console.log('=== FRONTEND DEBUG END ===');
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'bot-message';
    
    let sourcesHtml = '';
    if (data.sources && data.sources.length > 0) {
        sourcesHtml = `
            <div class="sources">
                <div class="sources-header" onclick="toggleSources(this)">
                    <h4><i class="fas fa-book"></i> 参考来源 (${data.sources.length})</h4>
                    <i class="fas fa-chevron-down sources-toggle"></i>
                </div>
                <div class="sources-content" style="display: none;">
                    ${data.sources.map((source, index) => {
                        const sourceId = `source-${Date.now()}-${index}`;
                        return `
                            <div class="source-item">
                                <div class="source-header" onclick="toggleSourceChunks('${sourceId}')">
                                    <span class="source-file">
                                        <i class="fas fa-file-alt"></i>
                                        ${escapeHtml(source.filename || '未知文件')}
                                    </span>
                                    ${source.fileType ? `<span class="file-type-badge">${source.fileType.toUpperCase()}</span>` : ''}
                                    <i class="fas fa-chevron-down chunk-toggle"></i>
                                </div>
                                <div class="source-chunks" id="${sourceId}" style="display: none;">
                                    ${source.chunks.map(chunk => {
                                        // Handle web search results differently
                                        if (chunk.metadata && chunk.metadata.url) {
                                            return `
                                                <div class="chunk-item web-result">
                                                    <div class="chunk-header">
                                                        <span class="chunk-index">
                                                            <i class="fas fa-globe"></i> ${chunk.metadata.title || 'Web Result ' + chunk.chunkIndex}
                                                        </span>
                                                        ${chunk.score ? `<span class="chunk-score">${(chunk.score * 100).toFixed(1)}%</span>` : ''}
                                                    </div>
                                                    <div class="chunk-content">
                                                        ${escapeHtml(chunk.content || chunk.pageContent || '内容不可用').replace(/\n/g, '<br>')}
                                                        <div class="web-link">
                                                            <a href="${escapeHtml(chunk.metadata.url)}" target="_blank" rel="noopener noreferrer">
                                                                <i class="fas fa-external-link-alt"></i> ${escapeHtml(chunk.metadata.url)}
                                                            </a>
                                                        </div>
                                                    </div>
                                                </div>
                                            `;
                                        } else {
                                            // Regular document chunk
                                            return `
                                                <div class="chunk-item">
                                                    <div class="chunk-header">
                                                        <span class="chunk-index">片段 ${chunk.chunkIndex}</span>
                                                        <span class="chunk-score">${(chunk.score * 100).toFixed(1)}%</span>
                                                    </div>
                                                    <div class="chunk-content">
                                                        ${escapeHtml(chunk.content || chunk.pageContent || '内容不可用').replace(/\n/g, '<br>')}
                                                    </div>
                                                </div>
                                            `;
                                        }
                                    }).join('')}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }
    
    messageDiv.innerHTML = `
        <div class="bot-avatar">
            <i class="fas fa-robot"></i>
        </div>
        <div class="message-content">
            ${escapeHtml(data.answer).replace(/\n/g, '<br>')}
            ${sourcesHtml}
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

// Add error message
function addErrorMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'bot-message error-message';
    messageDiv.innerHTML = `
        <div class="bot-avatar">
            <i class="fas fa-exclamation-triangle"></i>
        </div>
        <div class="message-content">
            ${escapeHtml(message)}
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

// Show typing indicator
function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'typing-indicator';
    typingDiv.id = 'typingIndicator';
    typingDiv.innerHTML = `
        <div class="bot-avatar">
            <i class="fas fa-robot"></i>
        </div>
        <div class="message-content">
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    
    chatMessages.appendChild(typingDiv);
    scrollToBottom();
}

// Remove typing indicator
function removeTypingIndicator() {
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

// Scroll to bottom of chat
function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Display query results
function displayResults(result) {
    const displayQuestion = document.getElementById('displayQuestion');
    const displayAnswer = document.getElementById('displayAnswer');
    const displaySources = document.getElementById('displaySources');
    
    // Check if elements exist before using them
    if (!displayQuestion || !displayAnswer || !displaySources) {
        console.warn('Display elements not found - results display not available');
        return;
    }
    
    // Add search type indicator to question
    const searchTypeText = result.searchType === 'hybrid' ? ' (Hybrid Search)' : ' (Vector Search)';
    displayQuestion.textContent = result.question + searchTypeText;
    displayAnswer.textContent = result.answer;
    
    // Display sources
    if (result.sources && result.sources.length > 0) {
        let sourcesHTML = '<h3><i class="fas fa-book"></i> Sources:</h3>';
        
        result.sources.forEach((source, index) => {
            sourcesHTML += `
                <div class="source-item">
                    <div class="source-filename">
                        <i class="fas fa-file"></i> ${source.filename}
                        ${source.fileType ? `<span class="file-type-badge">${source.fileType.toUpperCase()}</span>` : ''}
                        ${source.processedAt ? `<span class="processed-time">Processed: ${new Date(source.processedAt).toLocaleDateString()}</span>` : ''}
                    </div>
                    <div class="source-chunks-detailed">
                        ${source.chunks.map(chunk => {
                            let chunkHTML = `<div class="chunk-item">`;
                            chunkHTML += `<div class="chunk-header">`;
                            chunkHTML += `<span class="chunk-index">Chunk #${chunk.chunkIndex}</span>`;
                            if (chunk.score !== undefined) {
                                chunkHTML += `<span class="chunk-score">Score: ${chunk.score.toFixed(3)}</span>`;
                            }
                            chunkHTML += `</div>`;
                            
                            // Add hybrid search details if available
                             if (result.searchResults && result.searchResults.length > 0) {
                                 const chunkResult = result.searchResults.find(r => 
                                     r.metadata.source === source.filename && 
                                     (r.metadata.chunkIndex + 1) === chunk.chunkIndex
                                 );
                                 if (chunkResult) {
                                     chunkHTML += `<div class="chunk-details">`;
                                     if (chunkResult.searchType) {
                                         chunkHTML += `<span class="search-type-detail">${chunkResult.searchType.toUpperCase()}</span>`;
                                     }
                                     if (chunkResult.keywordRank) {
                                         chunkHTML += `<span class="rank-info">Keyword Rank: ${chunkResult.keywordRank}</span>`;
                                     }
                                     if (chunkResult.semanticRank) {
                                         chunkHTML += `<span class="rank-info">Semantic Rank: ${chunkResult.semanticRank}</span>`;
                                     }
                                     if (chunkResult.keywordScore !== null && chunkResult.keywordScore !== undefined) {
                                         chunkHTML += `<span class="score-info">Keyword Score: ${chunkResult.keywordScore.toFixed(3)}</span>`;
                                     }
                                     if (chunkResult.semanticScore !== null && chunkResult.semanticScore !== undefined) {
                                         chunkHTML += `<span class="score-info">Semantic Score: ${chunkResult.semanticScore.toFixed(3)}</span>`;
                                     }
                                     chunkHTML += `</div>`;
                                     
                                     // Add chunk content
                                     if (chunkResult.content) {
                                         chunkHTML += `<div class="chunk-content">`;
                                         chunkHTML += `<div class="chunk-content-header"><i class="fas fa-file-text"></i> Content:</div>`;
                                         chunkHTML += `<div class="chunk-content-text">${chunkResult.content.replace(/\n/g, '<br>')}</div>`;
                                         chunkHTML += `</div>`;
                                     }
                                 }
                             }
                            
                            chunkHTML += `</div>`;
                            return chunkHTML;
                        }).join('')}
                    </div>
                </div>
            `;
        });
        
        // Add search statistics if available
        if (result.searchStats) {
            sourcesHTML += `
                <div class="search-stats">
                    <h4><i class="fas fa-chart-bar"></i> Search Statistics:</h4>
                    <div class="stats-grid">
                        <span class="stat-item">Total Results: ${result.searchStats.totalResults}</span>
                        <span class="stat-item">Filtered Results: ${result.searchStats.filteredResults}</span>
                        <span class="stat-item">Final Results: ${result.searchStats.finalResults}</span>
                    </div>
                </div>
            `;
        }
        
        displaySources.innerHTML = sourcesHTML;
    } else {
        displaySources.innerHTML = '<p><i class="fas fa-info-circle"></i> No sources found</p>';
    }
    
    if (resultsSection) {
        resultsSection.style.display = 'block';
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    }
}

// Chat history functions
function addToChatHistory(question, answer, sources, searchType = 'vector') {
    const chatItem = {
        id: Date.now(),
        question: question,
        answer: answer,
        sources: sources,
        searchType: searchType,
        timestamp: new Date().toISOString()
    };
    
    chatHistory.unshift(chatItem);
    
    // Keep only last 50 items
    if (chatHistory.length > 50) {
        chatHistory = chatHistory.slice(0, 50);
    }
    
    saveChatHistory();
}

function clearChatHistory() {
    if (confirm('确定要清空所有聊天记录吗？')) {
        chatHistory = [];
        conversationHistory = [];
        saveChatHistory();
        
        // Clear chat messages except welcome message
        const welcomeMessage = chatMessages.querySelector('.welcome-message');
        chatMessages.innerHTML = '';
        if (welcomeMessage) {
            chatMessages.appendChild(welcomeMessage);
        }
        
        showToast('聊天记录已清空', 'success');
    }
}

function saveChatHistory() {
    try {
        localStorage.setItem('ragChatHistory', JSON.stringify(chatHistory));
        localStorage.setItem('ragConversationHistory', JSON.stringify(conversationHistory));
    } catch (error) {
        console.error('Failed to save chat history:', error);
    }
}

function loadChatHistory() {
    try {
        const savedChat = localStorage.getItem('ragChatHistory');
        const savedConversation = localStorage.getItem('ragConversationHistory');
        
        if (savedChat) {
            chatHistory = JSON.parse(savedChat);
        }
        
        if (savedConversation) {
            conversationHistory = JSON.parse(savedConversation);
        }
        
        // Restore chat messages from history
        restoreChatMessages();
        
    } catch (error) {
        console.error('Failed to load chat history:', error);
        chatHistory = [];
        conversationHistory = [];
    }
}

// Restore chat messages from history
function restoreChatMessages() {
    // Keep only the welcome message and restore recent conversations
    const welcomeMessage = chatMessages.querySelector('.welcome-message');
    chatMessages.innerHTML = '';
    if (welcomeMessage) {
        chatMessages.appendChild(welcomeMessage);
    }
    
    // Restore last 10 chat items
    const recentChats = chatHistory.slice(0, 10).reverse();
    recentChats.forEach(item => {
        addUserMessage(item.question);
        addBotMessage({
            answer: item.answer,
            sources: item.sources
        });
    });
}

// Status functions
async function updateStatus() {
    try {
        const response = await fetch('/status');
        const status = await response.json();
        
        document.getElementById('documentCount').textContent = status.documentsCount || 0;
        document.getElementById('lastUpdated').textContent = 
            status.lastUpdated && status.lastUpdated !== 'Never' 
                ? new Date(status.lastUpdated).toLocaleString()
                : 'Never';
        document.getElementById('systemStatus').textContent = 
            status.initialized ? 'Ready' : 'Initializing';
            
    } catch (error) {
        console.error('Failed to update status:', error);
        document.getElementById('systemStatus').textContent = 'Error';
    }
}

// Clear knowledge base
async function clearKnowledgeBase() {
    if (!confirm('Are you sure you want to clear the entire knowledge base? This action cannot be undone.')) {
        return;
    }
    
    if (isProcessing) {
        showToast('Please wait for the current operation to complete', 'warning');
        return;
    }
    
    isProcessing = true;
    showLoading(true);
    
    try {
        const response = await fetch('/clear', {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to clear knowledge base');
        }
        
        showToast('Knowledge base cleared successfully', 'success');
        updateStatus();
        
        // Clear results
        if (resultsSection) {
            resultsSection.style.display = 'none';
        }
        
    } catch (error) {
        console.error('Clear error:', error);
        showToast(`Failed to clear knowledge base: ${error.message}`, 'error');
    } finally {
        isProcessing = false;
        showLoading(false);
    }
}

// Utility functions
function showLoading(show) {
    loadingOverlay.style.display = show ? 'flex' : 'none';
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };
    
    toast.innerHTML = `
        <div class="toast-content">
            <i class="toast-icon ${icons[type] || icons.info}"></i>
            <span>${message}</span>
        </div>
    `;
    
    toastContainer.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 5000);
    
    // Remove on click
    toast.addEventListener('click', () => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    });
}

// Utility function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Toggle sources visibility
function toggleSources(headerElement) {
    const sourcesContent = headerElement.nextElementSibling;
    const toggleIcon = headerElement.querySelector('.sources-toggle');
    
    if (sourcesContent.style.display === 'none') {
        sourcesContent.style.display = 'block';
        toggleIcon.classList.remove('fa-chevron-down');
        toggleIcon.classList.add('fa-chevron-up');
    } else {
        sourcesContent.style.display = 'none';
        toggleIcon.classList.remove('fa-chevron-up');
        toggleIcon.classList.add('fa-chevron-down');
    }
}

// Toggle source chunks visibility
function toggleSourceChunks(sourceId) {
    const chunksElement = document.getElementById(sourceId);
    const headerElement = chunksElement.previousElementSibling;
    const toggleIcon = headerElement.querySelector('.chunk-toggle');
    
    if (chunksElement.style.display === 'none') {
        chunksElement.style.display = 'block';
        toggleIcon.classList.remove('fa-chevron-down');
        toggleIcon.classList.add('fa-chevron-up');
    } else {
        chunksElement.style.display = 'none';
        toggleIcon.classList.remove('fa-chevron-up');
        toggleIcon.classList.add('fa-chevron-down');
    }
}

// Refresh status every 30 seconds
setInterval(updateStatus, 30000);