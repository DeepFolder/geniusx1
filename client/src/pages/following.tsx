import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "wouter";
import { Building2, ArrowLeft, MapPin, Globe, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface Company {
  id: number;
  name: string;
  description: string | null;
  industry: string | null;
  location: string | null;
  logoPath: string | null;
  colorTheme: string;
  website?: string | null;
}

const formatExternalUrl = (url: string) => {
  if (!url) return '#';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `https://${url}`;
};

export default function FollowingPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: companies = [], isLoading } = useQuery<Company[]>({
    queryKey: ["/api/user/following"],
    enabled: !!user,
  });

  const { data: userFollows = [] } = useQuery<{ id: number, companyId: number }[]>({
    queryKey: ["/api/user/follows"],
    enabled: !!user,
  });

  const handleFollowCompany = async (e: React.MouseEvent, companyId: number, companyName: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast({
        title: "Login required",
        description: "Please log in to follow companies",
        variant: "destructive",
      });
      return;
    }
    const isFollowing = userFollows.some(follow => follow.companyId === companyId);
    try {
      if (isFollowing) {
        await apiRequest(`/api/companies/${companyId}/follow`, { method: "DELETE" });
      } else {
        await apiRequest(`/api/companies/${companyId}/follow`, { method: "POST" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/user/follows"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/following"] });
      toast({
        title: isFollowing ? "Unfollowed" : "Following",
        description: `You are ${isFollowing ? 'no longer following' : 'now following'} ${companyName}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update follow status",
        variant: "destructive",
      });
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-4">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Following</h1>
              <p className="text-gray-500 dark:text-gray-400 text-xs">Companies you follow</p>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 text-center">
            <p className="text-gray-600 dark:text-gray-400 mb-4">Sign in to view companies you follow</p>
            <Link href="/auth">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">Sign In</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-4">
      <div className="max-w-4xl mx-auto px-4 py-4">
        
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Following</h1>
            <p className="text-gray-500 dark:text-gray-400 text-xs">Companies you follow</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
              <p className="text-gray-500 dark:text-gray-400 mt-4">Loading companies...</p>
            </div>
          ) : companies.length === 0 ? (
            <div className="p-8 text-center">
              <Building2 className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
              <p className="text-gray-600 dark:text-gray-400 font-medium">Not following any companies</p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">Companies you follow will appear here</p>
              <Link href="/companies">
                <Button variant="outline" className="mt-4">
                  Browse Companies
                </Button>
              </Link>
            </div>
          ) : (
            <div className="p-4">
              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center">
                <Building2 className="w-3.5 h-3.5 mr-2" />
                Companies ({companies.length})
              </h4>
              <div className="grid grid-cols-1 gap-3">
                {companies.map((company, index) => {
                  const isFollowing = userFollows.some(follow => follow.companyId === company.id);
                  return (
                    <div 
                      key={company.id} 
                      className="group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md hover:border-purple-300 dark:hover:border-purple-600 transition-all duration-200 animate-in fade-in slide-in-from-bottom-3 duration-400 ease-out"
                      style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'both' }}
                    >
                      <Link href={`/company/${company.id}`}>
                        <div className="p-3 cursor-pointer">
                          <div className="flex items-start gap-3">
                            <div className="w-14 h-14 rounded-lg flex-shrink-0 relative overflow-hidden">
                              {company.logoPath ? (
                                <img 
                                  src={company.logoPath} 
                                  alt={company.name}
                                  className="w-full h-full object-contain bg-white p-1"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500">
                                  <Building2 className="w-6 h-6 text-white" />
                                </div>
                              )}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <h5 className="font-semibold text-sm text-gray-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors truncate">
                                {company.name}
                              </h5>
                              {company.location && (
                                <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                  <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
                                  <span className="truncate">{company.location}</span>
                                </div>
                              )}
                              {company.industry && (
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-[10px] font-medium text-gray-600 dark:text-gray-400 rounded">
                                    {company.industry}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {company.description && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">
                              {company.description}
                            </p>
                          )}
                        </div>
                      </Link>
                      
                      <div className="flex items-center gap-2 px-3 pb-3 pt-1">
                        {company.website && (
                          <a
                            href={formatExternalUrl(company.website)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/20 transition-colors text-xs font-medium"
                          >
                            <Globe className="w-3.5 h-3.5" />
                            Web
                          </a>
                        )}
                        <button
                          onClick={(e) => handleFollowCompany(e, company.id, company.name)}
                          className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border transition-colors text-xs font-medium",
                            isFollowing
                              ? "border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30"
                              : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                          )}
                        >
                          <Heart className={cn("w-3.5 h-3.5", isFollowing && "fill-current")} />
                          {isFollowing ? "Following" : "Follow"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link href="/">
            <Button variant="ghost" className="text-gray-600 dark:text-gray-400">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
