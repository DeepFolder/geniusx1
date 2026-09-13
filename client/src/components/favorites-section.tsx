import { Heart, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import type { Product } from "@shared/schema";
import FavoriteButton from "@/components/favorite-button";

export default function FavoritesSection() {
  const { data: favorites, isLoading } = useQuery<{ products: Product[] }>({
    queryKey: ["/api/favorites"],
  });

  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <Heart className="w-4 h-4 text-red-500 dark:text-red-400" />
            <span>Favorite Products</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading favorites...</div>
        </CardContent>
      </Card>
    );
  }

  const products = favorites?.products || [];

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
          <Heart className="w-4 h-4 text-red-500 dark:text-red-400" />
          <span>Favorite Products ({products.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {products.length === 0 ? (
          <div className="text-center py-6 text-gray-500 dark:text-gray-400">
            <Package className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p className="text-sm font-medium">No favorite products yet</p>
            <p className="text-xs mt-1 text-gray-400 dark:text-gray-500">Explore products and add them to your favorites</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {products.map((product) => (
              <div key={product.id} className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  {product.imagePath ? (
                    <img 
                      src={product.imagePath} 
                      alt={product.name}
                      className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 dark:from-green-600 dark:to-emerald-700 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Package className="w-5 h-5 text-white" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{product.name}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{product.category}</p>
                  </div>
                  <FavoriteButton type="product" id={product.id} className="p-1 flex-shrink-0" />
                </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}