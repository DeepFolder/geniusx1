import { useState } from "react";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface FavoriteButtonProps {
  type: 'company' | 'product';
  id: number;
  className?: string;
}

export default function FavoriteButton({ type, id, className = "" }: FavoriteButtonProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: favoriteStatus } = useQuery<{ isFavorited: boolean }>({
    queryKey: [`/api/favorites/${type}/${id}/check`],
    retry: false,
  });

  const isFavorited = favoriteStatus?.isFavorited || false;

  const toggleFavoriteMutation = useMutation({
    mutationFn: async () => {
      if (isFavorited) {
        return apiRequest("/api/favorites", {
          method: "DELETE",
          body: JSON.stringify({
            favoriteType: type,
            favoriteId: id
          })
        });
      } else {
        return apiRequest("/api/favorites", {
          method: "POST",
          body: JSON.stringify({
            favoriteType: type,
            favoriteId: id
          })
        });
      }
    },
    onSuccess: async () => {
      // Force refetch to bypass cache
      await queryClient.invalidateQueries({ queryKey: [`/api/favorites/${type}/${id}/check`], refetchType: 'active' });
      await queryClient.invalidateQueries({ queryKey: ["/api/favorites"], refetchType: 'active' });
      await queryClient.invalidateQueries({ queryKey: ["/api/user/favorite-products"], refetchType: 'active' });
      await queryClient.invalidateQueries({ queryKey: ["/api/user/following"], refetchType: 'active' });
      await queryClient.refetchQueries({ queryKey: [`/api/favorites/${type}/${id}/check`] });
      await queryClient.refetchQueries({ queryKey: ["/api/favorites"] });
      
      toast({
        title: isFavorited ? "Removed from favorites" : "Added to favorites",
        description: `${type.charAt(0).toUpperCase() + type.slice(1)} ${isFavorited ? 'removed from' : 'added to'} your favorites`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update favorites. Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavoriteMutation.mutate();
      }}
      disabled={toggleFavoriteMutation.isPending}
      className={`p-2 ${className}`}
    >
      <Heart 
        className={`w-4 h-4 ${
          isFavorited 
            ? "fill-red-500 text-red-500" 
            : "text-gray-400 hover:text-red-500"
        }`} 
      />
    </Button>
  );
}