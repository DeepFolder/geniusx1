import { useState } from "react";
import { Building2, Bookmark } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Company } from "@shared/schema";

interface UserFollow {
  id: number;
  userId: string;
  companyId: number;
  createdAt: Date | null;
  company: Company;
}

function CompanyLogo({ logoPath, companyName }: { logoPath: string | null; companyName: string }) {
  const [imageError, setImageError] = useState(false);

  if (!logoPath || imageError) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-blue-500 to-indigo-600 dark:from-blue-600 dark:to-indigo-700 rounded-lg flex items-center justify-center">
        <Building2 className="w-5 h-5 text-white" />
      </div>
    );
  }

  return (
    <img 
      src={logoPath} 
      alt={`${companyName} logo`}
      className="w-full h-full object-cover rounded-lg"
      onError={() => setImageError(true)}
    />
  );
}

export default function FollowingSection() {
  const { data: following, isLoading } = useQuery<UserFollow[]>({
    queryKey: ["/api/user/follows"],
  });

  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <Bookmark className="w-4 h-4 text-blue-500 dark:text-blue-400" />
            <span>Following Companies</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading companies...</div>
        </CardContent>
      </Card>
    );
  }

  const companies = following || [];

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
          <Bookmark className="w-4 h-4 text-blue-500 dark:text-blue-400" />
          <span>Following Companies ({companies.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {companies.length === 0 ? (
          <div className="text-center py-6 text-gray-500 dark:text-gray-400">
            <Building2 className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p className="text-sm font-medium">Not following any companies yet</p>
            <p className="text-xs mt-1 text-gray-400 dark:text-gray-500">Explore companies and follow them to stay updated</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {companies.slice(0, 5).map((follow) => (
              <Link key={follow.id} href={`/company/${follow.company.id}`}>
                <div className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                    <CompanyLogo logoPath={follow.company.logoPath} companyName={follow.company.name} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{follow.company.name}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{follow.company.industry}</p>
                    {follow.company.location && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{follow.company.location}</p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}