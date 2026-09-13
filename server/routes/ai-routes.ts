import express from 'express';
import { streamChat, ChatContext, initializeEmbeddingsIndex } from '../services/ai-service.js';

const router = express.Router();

// Initialize embeddings when AI routes are loaded
console.log('🤖 Initializing AI Routes...');
initializeEmbeddingsIndex().catch(console.error);

// Unified AI Chat endpoint with streaming support
router.post("/chat", async (req, res) => {
  try {
    const { message, context } = req.body;
    
    // Validate input
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: "Message is required" });
    }
    
    if (!context || !context.type || !context.sessionId) {
      return res.status(400).json({ error: "Context with type and sessionId is required" });
    }
    
    console.log(`🤖 AI Chat Request: ${context.type} - "${message.substring(0, 50)}..."`);
    
    // Set up Server-Sent Events for streaming
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    
    // Send initial connection confirmation
    res.write(`data: ${JSON.stringify({ type: 'connected', content: 'Stream established' })}\n\n`);
    
    try {
      // Start streaming AI response
      const chatContext: ChatContext = {
        type: context.type,
        id: context.id,
        data: context.data,
        sessionId: context.sessionId,
        userId: req.session?.userId || undefined
      };
      
      for await (const chunk of streamChat(message.trim(), chatContext)) {
        // Send each chunk as SSE
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        
        // Handle client disconnection
        if (req.destroyed) {
          console.log('Client disconnected from AI chat stream');
          break;
        }
      }
      
      // Send completion signal
      res.write(`data: ${JSON.stringify({ type: 'complete', content: 'Stream finished' })}\n\n`);
    } catch (error) {
      console.error('❌ Streaming AI Chat error:', error);
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        content: "I'm experiencing technical difficulties. Please try again in a moment." 
      })}\n\n`);
    }
    
    res.end();
  } catch (error) {
    console.error('❌ AI Chat endpoint error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to process chat request" });
    }
  }
});

// Non-streaming AI chat for backward compatibility
router.post("/chat-sync", async (req, res) => {
  try {
    const { message, context } = req.body;
    
    // Validate input
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: "Message is required" });
    }
    
    if (!context || !context.type || !context.sessionId) {
      return res.status(400).json({ error: "Context with type and sessionId is required" });
    }
    
    const chatContext: ChatContext = {
      type: context.type,
      id: context.id,
      data: context.data,
      sessionId: context.sessionId,
      userId: req.session?.userId || undefined
    };
    
    // Collect all streaming chunks into a single response
    let fullContent = '';
    let citations = [];
    let suggestions = [];
    let metadata = {};
    
    for await (const chunk of streamChat(message.trim(), chatContext)) {
      switch (chunk.type) {
        case 'token':
          fullContent += chunk.content;
          break;
        case 'citation':
          citations = chunk.content;
          break;
        case 'suggestion':
          suggestions = chunk.content;
          break;
        case 'metadata':
          metadata = chunk.content;
          break;
      }
    }
    
    res.json({
      response: fullContent,
      citations,
      suggestions,
      metadata
    });
    
  } catch (error) {
    console.error('❌ AI Chat sync error:', error);
    res.status(500).json({ 
      error: "Failed to process chat request",
      response: "I'm experiencing technical difficulties. Please try again in a moment."
    });
  }
});

// AI metrics endpoint
router.get("/metrics", (req, res) => {
  try {
    const metrics = require('../services/ai-service.js').getMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('❌ AI metrics error:', error);
    res.status(500).json({ error: "Failed to get metrics" });
  }
});

// Health check for AI service
router.get("/health", async (req, res) => {
  try {
    res.json({ 
      status: 'healthy', 
      service: 'ai-chat',
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error('❌ AI health check error:', error);
    res.status(500).json({ error: "AI service unhealthy" });
  }
});

export default router;