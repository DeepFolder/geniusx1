import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface BehaviorTrackingProps {
  userId?: string;
  action: 'view' | 'favorite' | 'download' | 'search' | 'contact';
  entityType: 'company' | 'product';
  entityId: number;
  context?: {
    searchQuery?: string;
    category?: string;
    industry?: string;
    duration?: number;
  };
}

// Hook for tracking user behavior
export function useTrackBehavior() {
  const mutation = useMutation({
    mutationFn: async (data: Omit<BehaviorTrackingProps, 'userId'>) => {
      return apiRequest('/api/ml/track-behavior', {
        method: 'POST',
        body: data
      });
    },
    onError: (error) => {
      console.error('Failed to track behavior:', error);
    }
  });

  return mutation.mutate;
}

// Component that automatically tracks page views
export function BehaviorTracker({ 
  userId, 
  action, 
  entityType, 
  entityId, 
  context 
}: BehaviorTrackingProps) {
  const trackBehavior = useTrackBehavior();

  useEffect(() => {
    if (userId && entityId && entityType && action) {
      trackBehavior({
        action,
        entityType,
        entityId,
        context
      });
    }
  }, [trackBehavior, userId, action, entityType, entityId]);

  return null; // This component doesn't render anything
}

// Manual tracking function for events
export function trackUserEvent(
  userId: string,
  action: BehaviorTrackingProps['action'],
  entityType: BehaviorTrackingProps['entityType'],
  entityId: number,
  context?: BehaviorTrackingProps['context']
) {
  // Fire and forget tracking
  if (!userId) {
    console.warn('User ID required for tracking');
    return;
  }
  
  apiRequest('/api/ml/track-behavior', {
    method: 'POST',
    body: {
      action,
      entityType,
      entityId,
      context
    }
  }).catch(error => {
    console.error('Failed to track user event:', error);
  });
}

export default BehaviorTracker;