import { Building2, MapPin, BadgeCheck, X, Heart, ChevronDown, FileText } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "wouter";
import { cn, formatExternalUrl } from "@/lib/utils";
import type { Company } from "../types";

interface CompanyCardProps {
  company: Company;
  index: number;
  isFollowing: boolean;
  onDismiss: (e: React.MouseEvent, companyId: number) => void;
  onFollow: (e: React.MouseEvent, companyId: number, companyName: string) => void;
}

export function CompanyCard({ company, index, isFollowing, onDismiss, onFollow }: CompanyCardProps) {
  const companyDocs = (company as Company & { documentPaths?: string[] }).documentPaths;

  return (
    <div
      className="group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md hover:border-purple-300 dark:hover:border-purple-600 transition-all duration-200 relative animate-in fade-in slide-in-from-bottom-3 duration-400 ease-out"
      style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'both' }}
    >
      <button
        onClick={(e) => onDismiss(e, company.id)}
        className="absolute top-2 left-2 z-20 w-5 h-5 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
        title="Remove from results"
      >
        <X className="w-3 h-3" />
      </button>

      <div className="absolute top-2 right-2 z-10">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700/50 rounded-md cursor-help">
                <BadgeCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-400">Verified</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="left"><p className="text-xs">Company is verified by DeepFolder</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="flex items-start p-3 gap-3">
        <Link href={`/company/${company.id}`}>
          <div className="w-14 h-14 rounded-lg flex-shrink-0 relative overflow-hidden cursor-pointer">
            {company.logoPath ? (
              <img
                src={company.logoPath}
                alt={company.name}
                className="w-full h-full object-contain bg-white p-1"
                onError={(e) => {
                  const el = e.currentTarget;
                  el.style.display = 'none';
                  const parent = el.parentElement;
                  if (parent && !parent.querySelector('.img-fallback')) {
                    const fb = document.createElement('div');
                    fb.className = 'img-fallback w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500';
                    fb.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>';
                    parent.appendChild(fb);
                  }
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500">
                <Building2 className="w-6 h-6 text-white" />
              </div>
            )}
          </div>
        </Link>

        <div className="flex-1 min-w-0">
          <Link href={`/company/${company.id}`}>
            <h5 className="font-semibold text-sm text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer line-clamp-1 mb-1">{company.name}</h5>
          </Link>
          <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mb-1">
            <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
            <span className="truncate">{company.location}</span>
          </div>
          {company.description && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1 mb-2 cursor-default">{company.description}</p>
                </TooltipTrigger>
                <TooltipContent side="top" align="center" sideOffset={2} avoidCollisions={false} className="max-w-[300px] z-[9999]">
                  <p className="text-xs">{company.description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full font-medium">{company.industry}</span>
          </div>
          <div className="flex items-center gap-3">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={`text-xs font-medium transition-colors ${company.website ? 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 cursor-pointer' : 'text-gray-400 dark:text-gray-500 cursor-not-allowed'}`}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (company.website) window.open(formatExternalUrl(company.website), '_blank'); }}
                    disabled={!company.website}
                  >
                    Web
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" align="start" sideOffset={8} className="max-w-xs z-[9999]" collisionPadding={16}>
                  <p className="text-xs break-all">{company.website || "No website available"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {companyDocs && companyDocs.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors cursor-pointer">
                    Downloads <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 z-[100]" sideOffset={5}>
                  {companyDocs.map((docPath: string, docIndex: number) => (
                    <DropdownMenuItem key={docIndex} onSelect={() => window.open(docPath, '_blank')} className="cursor-pointer">
                      <FileText className="w-4 h-4 mr-2 text-green-500" />
                      <span className="truncate">{docPath.split('/').pop() || `Document ${docIndex + 1}`}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span className="text-xs font-medium text-gray-400 dark:text-gray-500 cursor-not-allowed">Downloads</span>
            )}

            <button onClick={(e) => onFollow(e, company.id, company.name)} className="ml-auto">
              <Heart className={cn("w-4 h-4 cursor-pointer transition-colors", isFollowing ? "text-red-500 fill-red-500" : "text-gray-400 hover:text-red-500")} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
