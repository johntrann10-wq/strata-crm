import { UserIcon } from "@/components/shared/UserIcon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction, useActionForm } from "../hooks/useApi";
import { useState, type FormEvent } from "react";
import { Link, useOutletContext, useRevalidator } from "react-router";
import { api } from "../api";
import type { AuthOutletContext } from "./_app";

export default function ProfilePage() {
  const { user } = useOutletContext<AuthOutletContext>();
  const revalidator = useRevalidator();
  const [isEditing, setIsEditing] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isSettingPassword, setIsSettingPassword] = useState(false);

  const hasName = user.firstName || user.lastName;
  const title = hasName ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : user.email;
  const authMethod = user.googleProfileId
    ? user.hasPassword
      ? "Google + password"
      : "Google sign-in"
    : user.hasPassword
      ? "Email and password"
      : "Password not added";
  const canChangePassword = Boolean(user.hasPassword);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your identity, login method, and account security settings.</p>
      </div>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
        <Card className="border-white/65">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">User</CardTitle>
            <CardDescription>Keep your identity and core account details current across the workspace.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5 pt-0 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-4">
              <UserIcon user={user} className="h-16 w-16" />
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">{title}</h2>
                <p className="text-sm text-muted-foreground">{user.email}</p>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{authMethod}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setIsEditing(true)}>
                Edit profile
              </Button>
              {canChangePassword ? (
                <Button variant="ghost" onClick={() => setIsChangingPassword(true)}>
                  Change password
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setIsSettingPassword(true)}>
                  Add password
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/65">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Security</CardTitle>
            <CardDescription>Keep your login method reliable before real team usage starts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0 text-sm">
            <SecurityRow label="Email" value={user.email} />
            <SecurityRow label="Sign-in method" value={authMethod} />
            <SecurityRow
              label="Password access"
              value={canChangePassword ? "Enabled" : "Not added yet"}
            />
            <div className="rounded-xl border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
              {canChangePassword
                ? "If you ever forget your password, use the forgot-password flow from sign-in to reset it securely."
                : user.googleProfileId
                ? "Add a password if you want a fallback login option alongside Google."
                : "Add a password so this account has a direct email login option."}
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/forgot-password">Open forgot-password flow</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <Card className="border-white/65">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Account details</CardTitle>
            <CardDescription>These identity fields show across activity, assignments, and team records.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0 text-sm">
            <SecurityRow label="First name" value={user.firstName?.trim() || "Not set"} />
            <SecurityRow label="Last name" value={user.lastName?.trim() || "Not set"} />
            <SecurityRow label="Login email" value={user.email} />
          </CardContent>
        </Card>

        <Card className="border-white/65">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Credentials</CardTitle>
            <CardDescription>Use a password backup and keep your login flow clear before inviting more staff.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0 text-sm">
            <div className="rounded-xl border bg-card px-4 py-3">
              <p className="font-medium text-foreground">
                {user.googleProfileId ? "Google account connected" : "Email login enabled"}
              </p>
              <p className="mt-1 text-muted-foreground">
                {user.googleProfileId
                  ? "Google is currently your primary login path."
                  : "You can sign in directly with your email and password."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setIsEditing(true)}>
                Update profile
              </Button>
              {canChangePassword ? (
                <Button onClick={() => setIsChangingPassword(true)}>Change password</Button>
              ) : (
                <Button onClick={() => setIsSettingPassword(true)}>Add password</Button>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <EditProfileModal
        open={isEditing}
        onClose={() => {
          setIsEditing(false);
          revalidator.revalidate();
        }}
      />
      <ChangePasswordModal
        open={isChangingPassword}
        onClose={() => {
          setIsChangingPassword(false);
          revalidator.revalidate();
        }}
      />
      <SetPasswordModal
        open={isSettingPassword}
        onClose={() => {
          setIsSettingPassword(false);
          revalidator.revalidate();
        }}
      />
    </div>
  );
}

function SecurityRow(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{props.label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{props.value}</p>
    </div>
  );
}

const EditProfileModal = (props: { open: boolean; onClose: () => void }) => {
  const { user } = useOutletContext<AuthOutletContext>();

  const {
    register,
    submit,
    formState: { errors, isSubmitting },
  } = useActionForm(api.user.update, {
    defaultValues: user,
    onSuccess: props.onClose,
    send: ["firstName", "lastName"],
  });

  return (
    <Dialog open={props.open} onOpenChange={props.onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>Update the name shown across your Strata workspace.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid items-center gap-3">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" placeholder="First name" {...register("firstName")} />
            </div>
            <div className="grid items-center gap-3">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" placeholder="Last name" {...register("lastName")} />
            </div>
          </div>
          {errors?.root?.message ? <p className="text-sm text-destructive">{errors.root.message}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={props.onClose} type="button">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const ChangePasswordModal = (props: { open: boolean; onClose: () => void }) => {
  const [{ fetching }, changePassword] = useAction(api.user.changePassword);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onClose = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    props.onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    const result = await changePassword({ currentPassword, newPassword });
    if (result.error) {
      setError(result.error.message ?? "Could not change password.");
      return;
    }
    onClose();
  };

  return (
    <Dialog open={props.open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Enter your current password and choose a new one for future sign-ins.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid items-center gap-3">
            <Label htmlFor="currentPassword">Current password</Label>
            <Input id="currentPassword" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          </div>
          <div className="grid items-center gap-3">
            <Label htmlFor="newPassword">New password</Label>
            <Input id="newPassword" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          </div>
          <div className="grid items-center gap-3">
            <Label htmlFor="confirmNewPassword">Confirm new password</Label>
            <Input id="confirmNewPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button type="submit" disabled={fetching}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const SetPasswordModal = (props: { open: boolean; onClose: () => void }) => {
  const [{ fetching }, setPassword] = useAction(api.user.setPassword);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onClose = () => {
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    props.onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Password and confirmation do not match.");
      return;
    }
    const result = await setPassword({ newPassword });
    if (result.error) {
      setError(result.error.message ?? "Could not add password.");
      return;
    }
    onClose();
  };

  return (
    <Dialog open={props.open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add password</DialogTitle>
          <DialogDescription>Add a password so this account can sign in without relying only on Google.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid items-center gap-3">
            <Label htmlFor="setPassword">New password</Label>
            <Input id="setPassword" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          </div>
          <div className="grid items-center gap-3">
            <Label htmlFor="confirmSetPassword">Confirm password</Label>
            <Input id="confirmSetPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button type="submit" disabled={fetching}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
