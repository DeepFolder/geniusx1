import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Search, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

export interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isActive?: boolean | null;
  createdAt: string;
}

export default function UserManagement() {
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: string | null; name: string }>({ open: false, id: null, name: "" });
  const [roleDialog, setRoleDialog] = useState<{ open: boolean; userId: string | null; userName: string; newRole: string }>({ open: false, userId: null, userName: "", newRole: "" });
  const [suspendDialog, setSuspendDialog] = useState<{ open: boolean; userId: string | null; userName: string; suspend: boolean }>({ open: false, userId: null, userName: "", suspend: true });
  const { toast } = useToast();

  const { data: users = [], isLoading: usersLoading } = useQuery<UserRow[]>({
    queryKey: ["/api/platform-admin/users"],
  });

  const invalidateUsers = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/platform-admin/users"] });
    queryClient.invalidateQueries({ queryKey: ["/api/platform-admin/stats"] });
  };

  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) =>
      apiRequest(`/api/platform-admin/users/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      invalidateUsers();
      toast({ title: "Role updated", description: "User role has been successfully changed." });
      setRoleDialog({ open: false, userId: null, userName: "", newRole: "" });
    },
    onError: (error: any) =>
      toast({ title: "Error", description: error.message || "Failed to update user role", variant: "destructive" }),
  });

  const suspendUserMutation = useMutation({
    mutationFn: async ({ userId, suspend }: { userId: string; suspend: boolean }) =>
      apiRequest(`/api/platform-admin/users/${userId}/suspend`, {
        method: "PATCH",
        body: JSON.stringify({ suspend }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (_, variables) => {
      invalidateUsers();
      toast({
        title: variables.suspend ? "User suspended" : "User activated",
        description: variables.suspend ? "User has been suspended." : "User has been activated.",
      });
      setSuspendDialog({ open: false, userId: null, userName: "", suspend: true });
    },
    onError: (error: any) =>
      toast({ title: "Error", description: error.message || "Failed to update user status", variant: "destructive" }),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest(`/api/platform-admin/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateUsers();
      toast({ title: "User deleted", description: "The user has been successfully removed." });
      setDeleteDialog({ open: false, id: null, name: "" });
    },
    onError: (error: any) =>
      toast({ title: "Error", description: error.message || "Failed to delete user", variant: "destructive" }),
  });

  const filteredUsers = users.filter(
    (u) =>
      !searchQuery ||
      u.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.lastName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          placeholder="Search users..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          data-testid="input-search-users"
        />
      </div>

      <Card className="bg-card/80 border-border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usersLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Loading users...
                </TableCell>
              </TableRow>
            ) : filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => {
                const suspended = user.isActive === false;
                return (
                  <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                    <TableCell className="font-medium">{user.firstName} {user.lastName}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={user.role === "admin" ? "destructive" : "default"}>{user.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={suspended ? "secondary" : "outline"}>{suspended ? "Suspended" : "Active"}</Badge>
                    </TableCell>
                    <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" data-testid={`button-actions-${user.id}`}>
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setRoleDialog({ open: true, userId: user.id, userName: `${user.firstName} ${user.lastName}`, newRole: user.role })}>
                            Change Role
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setSuspendDialog({ open: true, userId: user.id, userName: `${user.firstName} ${user.lastName}`, suspend: !suspended })}>
                            {suspended ? "Unsuspend User" : "Suspend User"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => setDeleteDialog({ open: true, id: user.id, name: `${user.firstName} ${user.lastName}` })}
                          >
                            Delete User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the user "{deleteDialog.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteDialog({ open: false, id: null, name: "" })}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDialog.id && deleteUserMutation.mutate(deleteDialog.id)}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={roleDialog.open} onOpenChange={(open) => setRoleDialog({ ...roleDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change User Role</AlertDialogTitle>
            <AlertDialogDescription>Change the role for {roleDialog.userName}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="role-select" className="text-sm font-medium">Select New Role</Label>
            <Select value={roleDialog.newRole} onValueChange={(value) => setRoleDialog({ ...roleDialog, newRole: value })}>
              <SelectTrigger id="role-select" className="mt-2" data-testid="select-user-role">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRoleDialog({ open: false, userId: null, userName: "", newRole: "" })}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => roleDialog.userId && roleDialog.newRole && changeRoleMutation.mutate({ userId: roleDialog.userId, role: roleDialog.newRole })}
              disabled={changeRoleMutation.isPending || !roleDialog.newRole}
            >
              {changeRoleMutation.isPending ? "Updating..." : "Change Role"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={suspendDialog.open} onOpenChange={(open) => setSuspendDialog({ ...suspendDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{suspendDialog.suspend ? "Suspend User" : "Unsuspend User"}</AlertDialogTitle>
            <AlertDialogDescription>
              {suspendDialog.suspend
                ? `Are you sure you want to suspend ${suspendDialog.userName}? They will not be able to access the platform until reactivated.`
                : `Are you sure you want to unsuspend ${suspendDialog.userName}? They will regain access to the platform.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSuspendDialog({ open: false, userId: null, userName: "", suspend: true })}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => suspendDialog.userId && suspendUserMutation.mutate({ userId: suspendDialog.userId, suspend: suspendDialog.suspend })}
              className={suspendDialog.suspend ? "bg-red-600 hover:bg-red-700" : undefined}
              disabled={suspendUserMutation.isPending}
            >
              {suspendUserMutation.isPending ? "Working..." : suspendDialog.suspend ? "Suspend User" : "Unsuspend User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
