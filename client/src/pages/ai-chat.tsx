import { useRef } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import UnifiedChat from "@/components/chat/UnifiedChat";

export default function AIChatPage() {
  // Create a unique session ID for this chat instance
  const sessionId = useRef(`ai_chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  
  // Context configuration for global AI chat
  const chatContext = {
    type: 'global' as const,
    sessionId: sessionId.current,
    title: 'AI Search Assistant',
    subtitle: 'Ask me about companies, products, or anything related to manufacturing'
  };

  // Initial welcome message for AI Search
  const initialMessage = `Hello! I'm your AI Search Assistant powered by advanced language models and real-time data.

I can help you with:
🏭 Finding manufacturing companies and their capabilities
🔧 Discovering products, specifications, and technical details  
📚 Analyzing documents and providing insights
🤝 Connecting you with the right suppliers and partners

What would you like to explore today?`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Header */}
      <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-700/50 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link to="/">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="hover:bg-gray-100 dark:hover:bg-gray-700"
                  data-testid="button-back-home"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Home
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                  AI Search Assistant
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Ask me about companies, products, or anything related to manufacturing
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Sparkles className="w-6 h-6 text-purple-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">AI Powered</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Area with Unified Chat Component */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <UnifiedChat
          context={chatContext}
          initialMessage={initialMessage}
          maxHeight="calc(100vh - 200px)"
          className="shadow-2xl border-0"
          placeholder="Ask me anything about companies, products, specifications, quotes, or connections..."
          showHeader={false}
        />
      </div>
    </div>
  );
}