import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, CheckCircle2, XCircle, Clock, Users, User, Ban, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface AccessRequest {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  companyId: number | null;
  companyName: string | null;
  approvalStatus: string;
  approvalNote: string | null;
  createdAt: string;
  isActive: boolean | null;
}

function buildApprovalMailto(req: AccessRequest): string {
  const name = [req.firstName, req.lastName].filter(Boolean).join(' ') || 'there';
  const subject = encodeURIComponent('Your Genius X1 Account Has Been Approved');
  const body = encodeURIComponent(
`Hi ${name},

Great news — your Genius X1 account has been approved and you're officially in!

You can now sign in and start running engineering calculations right away.

Warm regards,
The Genius X1 Team`
  );
  return `mailto:${req.email}?subject=${subject}&body=${body}`;
}

function RequestRow({ req, onApprove, onReject, onSuspend, actingId, approvePending, rejectPending, suspendPending }: {
  req: AccessRequest;
  onApprove: (req: AccessRequest) => void;
  onReject: (id: string) => void;
  onSuspend: (id: string, suspend: boolean) => void;
  actingId: string | null;
  approvePending: boolean;
  rejectPending: boolean;
  suspendPending: boolean;
}) {
  const name = [req.firstName, req.lastName].filter(Boolean).join(' ') || 'Unknown';
  const date = req.createdAt ? new Date(req.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const isSuspended = req.isActive === false;
  const isActing = actingId === req.id;

  return (
    <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-card hover:bg-muted/30 transition-colors">
      <div className="flex items-start gap-3 min-w-0">
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
          <User className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="font-medium text-sm text-foreground truncate">{name}</div>
          <div className="text-xs text-muted-foreground truncate">{req.email}</div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="outline" className="text-xs py-0 h-5 capitalize">{req.role.replace('_', ' ')}</Badge>
            {isSuspended && (
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 text-xs py-0 h-5">
                <Ban className="w-3 h-3 mr-1" />Suspended
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">{date}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 ml-4">
        {req.approvalStatus === 'pending' && (
          <>
            <Button
              size="sm"
              onClick={() => onApprove(req)}
              disabled={isActing}
              className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
            >
              {isActing && approvePending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onReject(req.id)}
              disabled={isActing}
              className="h-8 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 text-xs"
            >
              {isActing && rejectPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3 mr-1" />}
              Reject
            </Button>
          </>
        )}

        {req.approvalStatus === 'approved' && (
          <>
            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">
              <CheckCircle2 className="w-3 h-3 mr-1" />Approved
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onReject(req.id)}
              disabled={isActing}
              className="h-8 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 text-xs"
            >
              {isActing && rejectPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3 mr-1" />}
              Reject
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onSuspend(req.id, !isSuspended)}
              disabled={isActing}
              className={`h-8 text-xs ${isSuspended
                ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950'
                : 'border-amber-200 text-amber-600 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950'
              }`}
            >
              {isActing && suspendPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : isSuspended ? (
                <ShieldCheck className="w-3 h-3 mr-1" />
              ) : (
                <Ban className="w-3 h-3 mr-1" />
              )}
              {isSuspended ? 'Unsuspend' : 'Suspend'}
            </Button>
          </>
        )}

        {req.approvalStatus === 'rejected' && (
          <>
            <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0">
              <XCircle className="w-3 h-3 mr-1" />Rejected
            </Badge>
            <Button
              size="sm"
              onClick={() => onApprove(req)}
              disabled={isActing}
              className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
            >
              {isActing && approvePending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
              Approve
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default function AccessRequests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeStatus, setActiveStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [actingId, setActingId] = useState<string | null>(null);

  const { data: requests = [], isLoading } = useQuery<AccessRequest[]>({
    queryKey: ['/api/admin/access-requests', activeStatus],
    queryFn: () => fetch(`/api/admin/access-requests?status=${activeStatus}`, { credentials: 'include' }).then(r => r.json()),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/admin/access-requests'] });
    queryClient.invalidateQueries({ queryKey: ['/api/platform-admin/users'] });
  };

  const approveMutation = useMutation({
    mutationFn: (req: AccessRequest) => apiRequest(`/api/admin/access-requests/${req.id}/approve`, { method: 'POST' }),
    onMutate: (req) => setActingId(req.id),
    onSuccess: (_, req) => {
      toast({ title: 'User approved', description: 'The user can now log in.' });
      window.open(buildApprovalMailto(req), '_blank');
      invalidate();
    },
    onError: () => toast({ title: 'Error', description: 'Failed to approve user.', variant: 'destructive' }),
    onSettled: () => setActingId(null),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/admin/access-requests/${id}/reject`, { method: 'POST' }),
    onMutate: (id) => setActingId(id),
    onSuccess: () => { toast({ title: 'Request rejected', description: 'The user has been denied access.' }); invalidate(); },
    onError: () => toast({ title: 'Error', description: 'Failed to reject user.', variant: 'destructive' }),
    onSettled: () => setActingId(null),
  });

  const suspendMutation = useMutation({
    mutationFn: ({ id, suspend }: { id: string; suspend: boolean }) =>
      apiRequest(`/api/platform-admin/users/${id}/suspend`, {
        method: 'PATCH',
        body: JSON.stringify({ suspend }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onMutate: ({ id }) => setActingId(id),
    onSuccess: (_, { suspend }) => {
      toast({ title: suspend ? 'User suspended' : 'User unsuspended', description: suspend ? 'The user can no longer log in.' : 'The user can log in again.' });
      invalidate();
    },
    onError: () => toast({ title: 'Error', description: 'Failed to update user status.', variant: 'destructive' }),
    onSettled: () => setActingId(null),
  });

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <CardTitle className="text-base">Access Requests</CardTitle>
            <CardDescription className="text-sm">Review and approve new user registrations before they can access the platform.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeStatus} onValueChange={(v) => setActiveStatus(v as any)}>
          <TabsList className="mb-5 h-9">
            <TabsTrigger value="pending" className="text-xs gap-1.5">
              <Clock className="w-3.5 h-3.5" />Pending
            </TabsTrigger>
            <TabsTrigger value="approved" className="text-xs gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />Approved
            </TabsTrigger>
            <TabsTrigger value="rejected" className="text-xs gap-1.5">
              <XCircle className="w-3.5 h-3.5" />Rejected
            </TabsTrigger>
          </TabsList>

          {(['pending', 'approved', 'rejected'] as const).map(status => (
            <TabsContent key={status} value={status}>
              {isLoading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
                </div>
              ) : requests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Users className="w-9 h-9 mb-3 opacity-30" />
                  <p className="text-sm">No {status} requests</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {requests.map(req => (
                    <RequestRow
                      key={req.id}
                      req={req}
                      onApprove={(req) => approveMutation.mutate(req)}
                      onReject={(id) => rejectMutation.mutate(id)}
                      onSuspend={(id, suspend) => suspendMutation.mutate({ id, suspend })}
                      actingId={actingId}
                      approvePending={approveMutation.isPending}
                      rejectPending={rejectMutation.isPending}
                      suspendPending={suspendMutation.isPending}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
