import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart, MessageCircle, Share2, MoreHorizontal, Calendar, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/utils";
import type { CompanyPost, PostComment } from "@shared/schema";

interface NewsFeedProps {
  companyId: number;
  companyName: string;
  isOwnCompany?: boolean;
}

interface PostWithInteractions extends CompanyPost {
  isLiked?: boolean;
  author?: {
    firstName: string;
    lastName: string;
  };
}

export default function NewsFeed({ companyId, companyName, isOwnCompany = false }: NewsFeedProps) {
  const [newPostContent, setNewPostContent] = useState("");
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());
  const [commentTexts, setCommentTexts] = useState<Record<number, string>>({});
  const queryClient = useQueryClient();

  const { data: posts = [], isLoading } = useQuery<PostWithInteractions[]>({
    queryKey: [`/api/companies/${companyId}/posts`],
  });

  const createPostMutation = useMutation({
    mutationFn: async (data: { title: string; content: string; postType: string }) => {
      const response = await fetch(`/api/companies/${companyId}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create post');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/posts`] });
      setNewPostContent("");
    },
  });

  const likePostMutation = useMutation({
    mutationFn: async (postId: number) => {
      const response = await fetch(`/api/posts/${postId}/like`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to like post');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/posts`] });
    },
  });

  const handleCreatePost = () => {
    if (!newPostContent.trim()) return;
    
    createPostMutation.mutate({
      title: "Company Update",
      content: newPostContent,
      postType: "news"
    });
  };

  const handleLikePost = (postId: number, isLiked: boolean) => {
    likePostMutation.mutate(postId);
  };

  const toggleComments = (postId: number) => {
    setExpandedComments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(postId)) {
        newSet.delete(postId);
      } else {
        newSet.add(postId);
      }
      return newSet;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-32"></div>
                  <div className="h-3 bg-gray-200 rounded w-24"></div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-4 bg-gray-200 rounded w-full"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-32 bg-gray-200 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Create Post (only for company admins) */}
      {isOwnCompany && (
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">Share an Update</h3>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder={`What's new at ${companyName}?`}
              value={newPostContent}
              onChange={(e) => setNewPostContent(e.target.value)}
              className="min-h-[100px] resize-none"
            />
            <div className="flex justify-between items-center">
              <div className="flex space-x-2">
                <Badge variant="outline" className="text-xs">
                  <Calendar className="w-3 h-3 mr-1" />
                  News Update
                </Badge>
              </div>
              <Button 
                onClick={handleCreatePost}
                disabled={!newPostContent.trim() || createPostMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {createPostMutation.isPending ? "Posting..." : "Post Update"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Posts Feed */}
      {posts.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <MessageCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No posts yet</h3>
            <p className="text-gray-600">
              {isOwnCompany 
                ? "Share your first update to connect with your audience" 
                : `${companyName} hasn't shared any updates yet`}
            </p>
          </CardContent>
        </Card>
      ) : (
        posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            companyName={companyName}
            onLike={(isLiked) => handleLikePost(post.id, isLiked)}
            isCommentsExpanded={expandedComments.has(post.id)}
            onToggleComments={() => toggleComments(post.id)}
          />
        ))
      )}
    </div>
  );
}

interface PostCardProps {
  post: PostWithInteractions;
  companyName: string;
  onLike: (isLiked: boolean) => void;
  isCommentsExpanded: boolean;
  onToggleComments: () => void;
}

function PostCard({
  post,
  companyName,
  onLike,
  isCommentsExpanded,
  onToggleComments
}: PostCardProps) {
  const getPostTypeColor = (type: string) => {
    switch (type) {
      case 'product': return 'bg-blue-100 text-blue-800';
      case 'event': return 'bg-green-100 text-green-800';
      case 'update': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <Avatar>
              <AvatarFallback>
                {companyName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center space-x-2">
                <h4 className="font-semibold text-gray-900">{companyName}</h4>
                <Badge variant="outline" className={`text-xs ${getPostTypeColor(post.postType)}`}>
                  {post.postType}
                </Badge>
              </div>
              <p className="text-sm text-gray-500">
                {formatDate(post.createdAt!)}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <h3 className="font-semibold text-lg mb-2">{post.title}</h3>
          <p className="text-gray-700 leading-relaxed">{post.content}</p>
        </div>

        {post.imageUrl && (
          <div className="rounded-lg overflow-hidden">
            <img 
              src={post.imageUrl} 
              alt="Post image" 
              className="w-full h-64 object-cover"
            />
          </div>
        )}

        <Separator />

        {/* Post Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onLike(post.isLiked || false)}
              className={`flex items-center space-x-2 ${
                post.isLiked ? 'text-red-600 hover:text-red-700' : 'text-gray-600 hover:text-gray-700'
              }`}
            >
              <Heart className={`w-4 h-4 ${post.isLiked ? 'fill-current' : ''}`} />
              <span>{post.likesCount || 0}</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleComments}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-700"
            >
              <MessageCircle className="w-4 h-4" />
              <span>{post.commentsCount || 0}</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-700"
            >
              <Share2 className="w-4 h-4" />
              <span>Share</span>
            </Button>
          </div>
        </div>

        {/* Comments Section */}
        {isCommentsExpanded && (
          <div className="space-y-4 pt-4 border-t">
            <div className="text-center py-8">
              <MessageCircle className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">Comments feature coming soon</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}