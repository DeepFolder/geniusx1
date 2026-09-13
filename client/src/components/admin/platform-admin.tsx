import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Activity, TrendingUp } from "lucide-react";
import UserManagement, { type UserRow } from "./UserManagement";

interface PlatformStats {
  totalUsers: number;
  activeSessions: number;
  usersGrowth: number;
  recentActivity?: Array<{
    description: string;
    timestamp: string;
    type: string;
  }>;
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Unknown';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Unknown';
  const diff = Date.now() - date.getTime();
  if (diff < 0) return 'Unknown';
  if (diff < 60000) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;
  return `${Math.floor(days / 30)} month${Math.floor(days / 30) !== 1 ? 's' : ''} ago`;
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Unknown';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' · '
    + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

interface PlatformAdminProps {
  lastVisitForNew?: string | null;
}

export default function PlatformAdmin({ lastVisitForNew }: PlatformAdminProps = {}) {
  const { data: stats } = useQuery<PlatformStats>({
    queryKey: ['/api/platform-admin/stats'],
  });

  const { data: users = [], isLoading: usersLoading } = useQuery<UserRow[]>({
    queryKey: ['/api/platform-admin/users'],
  });

  const recentRegistrations = useMemo(() => {
    return [...users]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);
  }, [users]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/platform-admin/stats'] });
    queryClient.invalidateQueries({ queryKey: ['/api/platform-admin/users'] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Platform Admin</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage users, roles, and account access</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} data-testid="button-refresh">
          <Activity className="w-4 h-4 mr-2" />
          Refresh Data
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-users">
              {stats?.totalUsers || 0}
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3 text-green-600" />
              {stats?.usersGrowth || 0}% from last month
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-active-sessions">
              {stats?.activeSessions || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Users online now
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/80 border-border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            Recent Registrations
          </CardTitle>
          <CardDescription>Latest sign-ups, newest first (up to 10)</CardDescription>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : recentRegistrations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No registered users yet.</p>
          ) : (
            <div className="space-y-3">
              {recentRegistrations.map((u) => {
                const initials = `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase() || '?';
                const isNew = lastVisitForNew
                  ? new Date(u.createdAt).getTime() > new Date(lastVisitForNew).getTime()
                  : false;
                return (
                  <div key={u.id} className="flex items-center justify-between border-b border-border pb-3 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0">
                        {initials}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground leading-tight">
                          {u.firstName} {u.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isNew && (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 bg-blue-500 hover:bg-blue-500">
                          New
                        </Badge>
                      )}
                      <div className="text-right">
                        <p className="text-xs text-foreground whitespace-nowrap">{formatDateTime(u.createdAt)}</p>
                        <p className="text-[11px] text-muted-foreground whitespace-nowrap">{timeAgo(u.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h3 className="text-base font-semibold text-foreground">User Management</h3>
        <UserManagement />
      </div>

      <Card className="bg-card/80 border-border shadow-sm">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest platform events and actions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats?.recentActivity && stats.recentActivity.length > 0 ? (
              stats.recentActivity.map((activity, index) => (
                <div key={index} className="flex items-center justify-between border-b border-border pb-3 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{activity.description}</p>
                    <p className="text-xs text-muted-foreground">{activity.timestamp}</p>
                  </div>
                  <Badge variant={activity.type === 'success' ? 'default' : 'secondary'}>
                    {activity.type}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No recent activity</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
