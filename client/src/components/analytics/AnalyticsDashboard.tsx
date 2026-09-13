import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  Eye, 
  Download, 
  Users, 
  Building, 
  Package,
  DollarSign,
  Target,
  Activity,
  Calendar,
  Globe
} from "lucide-react";

interface AnalyticsData {
  overview: {
    totalViews: number;
    totalDownloads: number;
    totalConnections: number;
    conversionRate: number;
    growthRate: number;
    revenue: number;
  };
  charts: {
    viewsOverTime: { date: string; views: number; downloads: number }[];
    topProducts: { name: string; views: number; downloads: number }[];
    industryBreakdown: { industry: string; count: number; percentage: number }[];
    geographicData: { country: string; visits: number; revenue: number }[];
    engagementMetrics: { metric: string; value: number; change: number }[];
  };
  competitors: {
    name: string;
    marketShare: number;
    growth: number;
    engagement: number;
  }[];
}

interface AnalyticsDashboardProps {
  companyId: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function AnalyticsDashboard({ companyId }: AnalyticsDashboardProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  
  const { data: analytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['/api/analytics', companyId, selectedPeriod],
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  const { data: marketInsights } = useQuery({
    queryKey: ['/api/analytics/market-insights', companyId],
    refetchInterval: 3600000, // Refresh every hour
  });

  const MetricCard = ({ title, value, change, icon: Icon, trend }: {
    title: string;
    value: string | number;
    change: number;
    icon: any;
    trend?: 'up' | 'down' | 'neutral';
  }) => (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          </div>
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
            <Icon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
        {change !== 0 && (
          <div className="mt-4 flex items-center">
            {change > 0 ? (
              <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
            )}
            <span className={`text-sm font-medium ${
              change > 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {change > 0 ? '+' : ''}{change.toFixed(1)}%
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">
              vs last period
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-3/4 mb-2" />
                <div className="h-8 bg-gray-300 dark:bg-gray-700 rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!analytics) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Analytics Dashboard</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Track your company's performance and market insights
          </p>
        </div>
        
        <div className="flex items-center space-x-2">
          {['7d', '30d', '90d', '1y'].map((period) => (
            <Button
              key={period}
              variant={selectedPeriod === period ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedPeriod(period as any)}
            >
              {period}
            </Button>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Views"
          value={analytics.overview.totalViews.toLocaleString()}
          change={analytics.overview.growthRate}
          icon={Eye}
        />
        <MetricCard
          title="Downloads"
          value={analytics.overview.totalDownloads.toLocaleString()}
          change={15.2}
          icon={Download}
        />
        <MetricCard
          title="Connections"
          value={analytics.overview.totalConnections.toLocaleString()}
          change={8.7}
          icon={Users}
        />
        <MetricCard
          title="Conversion Rate"
          value={`${analytics.overview.conversionRate.toFixed(1)}%`}
          change={2.3}
          icon={Target}
        />
      </div>

      {/* Charts */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="audience">Audience</TabsTrigger>
          <TabsTrigger value="competition">Competition</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Views and Downloads Over Time */}
            <Card>
              <CardHeader>
                <CardTitle>Views & Downloads</CardTitle>
                <CardDescription>Performance over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={analytics.charts.viewsOverTime}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Area type="monotone" dataKey="views" stackId="1" stroke="#8884d8" fill="#8884d8" />
                    <Area type="monotone" dataKey="downloads" stackId="1" stroke="#82ca9d" fill="#82ca9d" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Engagement Metrics */}
            <Card>
              <CardHeader>
                <CardTitle>Engagement Metrics</CardTitle>
                <CardDescription>Key performance indicators</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analytics.charts.engagementMetrics.map((metric, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {metric.metric}
                        </p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {metric.value}
                        </p>
                      </div>
                      <div className="flex items-center">
                        {metric.change > 0 ? (
                          <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
                        )}
                        <span className={`text-sm font-medium ${
                          metric.change > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {metric.change > 0 ? '+' : ''}{metric.change}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="products" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Products */}
            <Card>
              <CardHeader>
                <CardTitle>Top Products</CardTitle>
                <CardDescription>Most viewed and downloaded products</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={analytics.charts.topProducts}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="views" fill="#8884d8" />
                    <Bar dataKey="downloads" fill="#82ca9d" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Product Performance List */}
            <Card>
              <CardHeader>
                <CardTitle>Product Performance</CardTitle>
                <CardDescription>Detailed metrics for each product</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analytics.charts.topProducts.map((product, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                          <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {product.name}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {product.views} views • {product.downloads} downloads
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary">
                        {((product.downloads / product.views) * 100).toFixed(1)}%
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="audience" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Industry Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Industry Breakdown</CardTitle>
                <CardDescription>Audience by industry</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={analytics.charts.industryBreakdown}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ industry, percentage }) => `${industry} (${percentage}%)`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {analytics.charts.industryBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Geographic Data */}
            <Card>
              <CardHeader>
                <CardTitle>Geographic Distribution</CardTitle>
                <CardDescription>Visitors by country</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analytics.charts.geographicData.map((country, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <Globe className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {country.country}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {country.visits} visits
                        </span>
                        <Badge variant="outline">
                          ${country.revenue.toLocaleString()}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="competition" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Competitive Analysis</CardTitle>
              <CardDescription>Compare your performance with competitors</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analytics.competitors.map((competitor, index) => (
                  <div key={index} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-900 dark:text-white">
                        {competitor.name}
                      </h4>
                      <Badge variant={competitor.growth > 0 ? 'default' : 'secondary'}>
                        {competitor.growth > 0 ? '+' : ''}{competitor.growth}%
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Market Share</p>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {competitor.marketShare}%
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Growth</p>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {competitor.growth}%
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Engagement</p>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {competitor.engagement}%
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Market Insights */}
      {marketInsights && (
        <Card>
          <CardHeader>
            <CardTitle>Market Insights</CardTitle>
            <CardDescription>AI-powered market analysis and recommendations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                  Growth Opportunities
                </h4>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  {marketInsights.opportunities.map((opportunity: string, index: number) => (
                    <li key={index} className="flex items-start">
                      <TrendingUp className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                      {opportunity}
                    </li>
                  ))}
                </ul>
              </div>
              
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                  Recommendations
                </h4>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  {marketInsights.recommendations.map((rec: string, index: number) => (
                    <li key={index} className="flex items-start">
                      <Target className="w-4 h-4 text-blue-500 mr-2 mt-0.5 flex-shrink-0" />
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}