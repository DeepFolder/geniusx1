import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Company, Product } from "../types";

/** Derives the same canonical key the server uses for external-product identity. */
function computeExternalKey(product: Product): string {
  if (product.productWebLink) {
    return product.productWebLink.toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }
  return `${(product.name || '').toLowerCase().trim()}::${(product.companyName || '').toLowerCase().trim()}`;
}

export function useSocialActions(user: any) {
  const { toast } = useToast();

  const { data: userFollows = [] } = useQuery<{ id: number; companyId: number }[]>({
    queryKey: ["/api/user/follows"],
    enabled: !!user,
  });

  const { data: userFavorites = { products: [], companies: [] } } = useQuery<{ products: Product[]; companies: Company[] }>({
    queryKey: ["/api/favorites"],
    enabled: !!user,
  });

  const favoriteProductIds = new Set<number>(userFavorites.products?.map(p => p.id) || []);

  const handleFollowCompany = async (e: React.MouseEvent, companyId: number, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast({ title: "Login required", description: "Please log in to follow companies", variant: "destructive" });
      return;
    }
    const isFollowing = userFollows.some(f => f.companyId === companyId);
    await apiRequest(`/api/companies/${companyId}/follow`, { method: isFollowing ? "DELETE" : "POST" });
    queryClient.invalidateQueries({ queryKey: ["/api/user/follows"] });
    toast({ title: isFollowing ? "Unfollowed" : "Following", description: `You are ${isFollowing ? 'no longer following' : 'now following'} ${name}` });
  };

  const handleFavoriteProduct = async (e: React.MouseEvent, productId: number, productName: string, product?: Product) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast({ title: "Login required", description: "Please log in to save favorites", variant: "destructive" });
      return;
    }
    const isFavorited = favoriteProductIds.has(productId);
    const canonicalKey = product?.isExternal ? computeExternalKey(product) : null;
    const externalData = product?.isExternal ? {
      name: product.name, description: product.description ?? '', category: product.category ?? 'Product',
      imagePath: product.imagePath ?? null, catalogPath: product.catalogPath ?? null, modelPath: product.modelPath ?? null,
      productWebLink: product.productWebLink ?? null, documentPaths: product.documentPaths ?? null,
      companyName: product.companyName ?? null, companyWebsite: product.companyWebsite ?? null,
      canonicalKey,
    } : null;
    await apiRequest(`/api/favorites`, {
      method: isFavorited ? "DELETE" : "POST",
      body: JSON.stringify(isFavorited
        ? { favoriteType: "product", favoriteId: productId, externalKey: canonicalKey }
        : { favoriteType: "product", favoriteId: productId, externalData }),
    });
    queryClient.invalidateQueries({ queryKey: ["/api/favorites"] });
    queryClient.invalidateQueries({ queryKey: ["/api/user/favorite-products"] });
    toast({ title: isFavorited ? "Removed from favorites" : "Added to favorites", description: `${productName} ${isFavorited ? 'removed from' : 'added to'} your favorites` });
  };

  return { userFollows, favoriteProductIds, handleFollowCompany, handleFavoriteProduct };
}
