export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  message: string;
  conversationHistory?: ChatMessage[];
  companyId?: number;
}

export interface ChatResponse {
  message: string;
  timestamp: string;
}
