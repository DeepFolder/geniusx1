import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AIMatchmaking from "@/components/ai/AIMatchmaking";
import DocumentAnalyzer from "@/components/ai/DocumentAnalyzer";
import AnalyticsDashboard from "@/components/analytics/AnalyticsDashboard";
import { Brain, TrendingUp, FileText, BarChart3 } from "lucide-react";

export default function AIInsights() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/auth";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-black">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <Brain className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">AI Insights</h1>
          </div>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Advanced AI-powered tools for intelligent business decisions, document analysis, and market insights
          </p>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="matchmaking" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="matchmaking" className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4" />
              <span>AI Matchmaking</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center space-x-2">
              <FileText className="w-4 h-4" />
              <span>Document Intelligence</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4" />
              <span>Analytics</span>
            </TabsTrigger>
            <TabsTrigger value="insights" className="flex items-center space-x-2">
              <Brain className="w-4 h-4" />
              <span>Market Insights</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="matchmaking">
            <AIMatchmaking companyId={user.companyId || 1} />
          </TabsContent>

          <TabsContent value="documents">
            <DocumentAnalyzer companyId={user.companyId || 1} />
          </TabsContent>

          <TabsContent value="analytics">
            <AnalyticsDashboard companyId={user.companyId || 1} />
          </TabsContent>

          <TabsContent value="insights">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Brain className="w-5 h-5" />
                  <span>Market Intelligence</span>
                </CardTitle>
                <CardDescription>
                  AI-powered market analysis and strategic recommendations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <Brain className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">
                    Advanced Market Intelligence
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    Coming soon: Real-time market analysis, competitor tracking, and strategic insights
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}