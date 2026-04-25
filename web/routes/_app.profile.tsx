import { useState, type FormEvent } from "react";
import { Link, useNavigate, useOutletContext, useRevalidator } from "react-router";
import { UserIcon } from "@/components/shared/UserIcon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trackEvent } from "@/lib/analytics";
import { api } from "../api";
import { useAction, useActionForm, useFindOne } from "../hooks/useApi";
import { clearAuthState } from "../lib/auth";
import type { AuthOutletContext } from "./_app";

function formatAuthMethodList(values: string[]): string {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

type AccountDeletionPreviewData = {
  ownedBusinessCount?: number;
  businessMembershipCount?: number;
  linkedStaffProfileCount?: number;
  deletedDataSummary?: string[];
  retainedDataSummary?: string[];
  requiresHistoricalRetention?: boolean;
};

type ProfileData = {
  id?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  hasPassword?: boolean;
  googleProfileId?: string | null;
  appleSubject?: string | null;
  appleEmailIsPrivateRelay?: boolean;
  accountDeletionPreview?: AccountDeletionPreviewData;
};

export default function ProfilePage() {
  const { user, refreshUser } = useOutletContext<AuthOutletContext>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [isEditing, setIsEditing] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [{ data: profileData }, refetchProfile] = useFindOne(api.user, String(user.id ?? ""), {
    pause: !user?.id,
  });

  const profile = ((profileData as ProfileData | undefined) ?? (user as ProfileData)) as ProfileData;
  const title =
    profile.firstName || profile.lastName
      ? `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim()
      : profile.email ?? "Profile";
  const hasApple = Boolean(profile.appleSubject);
  const hasGoogle = Boolean(profile.googleProfileId);
  const connectedIdentityProviders = [hasApple ? "Apple" : null, hasGoogle ? "Google" : null].filter(Boolean) as string[];
  const authMethodParts = [...connectedIdentityProviders, profile.hasPassword ? "Password" : null].filter(Boolean) as string[];
  const authMethod = authMethodParts.length > 0 ? authMethodParts.join(" + ") : "Password not added";
  const connectedProviderLabel = formatAuthMethodList(connectedIdentityProviders);
  const canChangePassword = Boolean(profile.hasPassword);
  const canAddPassword = Boolean(!profile.hasPassword);
  const accountDeletionPreview = profile.accountDeletionPreview ?? {};
  const ownedBusinessCount = accountDeletionPreview.ownedBusinessCount ?? 0;
  const businessMembershipCount = accountDeletionPreview.businessMembershipCount ?? 0;
  const linkedStaffProfileCount = accountDeletionPreview.linkedStaffProfileCount ?? 0;
  const deletedDataSummary = accountDeletionPreview.deletedDataSummary ?? [];
  const retainedDataSummary = accountDeletionPreview.retainedDataSummary ?? [];
  const workspaceAssociationCount = ownedBusinessCount + businessMembershipCount;

  const refreshProfile = async () => {
    await Promise.allSettled([refreshUser(), refetchProfile()]);
    revalidator.revalidate();
  };

  const openDeleteAccount = () => {
    trackEvent("account_deletion_opened", { surface: "profile" });
    setIsDeletingAccount(true);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-4 pb-28 sm:space-y-6 sm:p-6">
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
                <p className="text-sm text-muted-foreground">{profile.email ?? "No email"}</p>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{authMethod}</p>
              </div>
            </div>
            <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap">
              <Button variant="outline" onClick={() => setIsEditing(true)} className="w-full sm:w-auto">
                Edit profile
              </Button>
              {canChangePassword ? (
                <Button variant="ghost" onClick={() => setIsChangingPassword(true)} className="w-full sm:w-auto">
                  Change password
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setIsSettingPassword(true)} className="w-full sm:w-auto">
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
            <SecurityRow label="Email" value={profile.email ?? "Not set"} />
            <SecurityRow label="Sign-in method" value={authMethod} />
            <SecurityRow label="Apple sign-in" value={hasApple ? "Connected" : "Not connected"} />
            {hasApple ? (
              <SecurityRow label="Apple relay email" value={profile.appleEmailIsPrivateRelay ? "Enabled" : "Not enabled"} />
            ) : null}
            <SecurityRow label="Password access" value={profile.hasPassword ? "Enabled" : "Not added yet"} />
            <div className="rounded-xl border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
              {connectedIdentityProviders.length > 0
                ? profile.hasPassword
                  ? `This account can sign in with ${formatAuthMethodList([...connectedIdentityProviders, "password"])}. If you ever forget the password, use the forgot-password flow instead.`
                  : `This account currently signs in with ${connectedProviderLabel}. Add a password if you want an email fallback too.`
                : canChangePassword
                  ? "If you ever forget your password, use the forgot-password flow from sign-in to reset it securely."
                  : "Add a password so this account has a direct email login option."}
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to={`/forgot-password?email=${encodeURIComponent(profile.email ?? "")}`}>Open forgot-password flow</Link>
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
            <SecurityRow label="First name" value={profile.firstName?.trim() || "Not set"} />
            <SecurityRow label="Last name" value={profile.lastName?.trim() || "Not set"} />
            <SecurityRow label="Login email" value={profile.email ?? "Not set"} />
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
                {connectedIdentityProviders.length > 0 ? `${connectedProviderLabel} connected` : "Email login enabled"}
              </p>
              <p className="mt-1 text-muted-foreground">
                {connectedIdentityProviders.length > 0
                  ? profile.hasPassword
                    ? `${connectedProviderLabel} can sign in here, and this account also has a password fallback.`
                    : `${connectedProviderLabel} is currently your primary login path.`
                  : "You can sign in directly with your email and password."}
              </p>
              {profile.appleEmailIsPrivateRelay ? (
                <p className="mt-3 rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  Apple&apos;s private relay email is enabled for this account. Transactional emails should still route through Apple&apos;s relay address.
                </p>
              ) : null}
            </div>
            <div className="grid gap-2 sm:flex sm:flex-wrap">
              <Button variant="outline" onClick={() => setIsEditing(true)} className="w-full sm:w-auto">
                Update profile
              </Button>
              {canChangePassword ? (
                <>
                  <Button onClick={() => setIsChangingPassword(true)} className="w-full sm:w-auto">Change password</Button>
                  <Button asChild variant="outline" className="w-full sm:w-auto">
                    <Link to={`/forgot-password?email=${encodeURIComponent(profile.email ?? "")}`}>Reset password</Link>
                  </Button>
                </>
              ) : canAddPassword ? (
                <Button onClick={() => setIsSettingPassword(true)} className="w-full sm:w-auto">Add password</Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <Card className="border-white/65">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Privacy, support, and policies</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0 text-sm">
            <div className="rounded-xl border bg-card px-4 py-3">
              <p className="font-medium text-foreground">Need help or a privacy answer?</p>
              <p className="mt-1 text-muted-foreground">
                Reach the Strata team directly if you need support, legal details, or help with an account-level request.
              </p>
            </div>
            <div className="grid gap-2 sm:flex sm:flex-wrap">
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link to="/privacy">Privacy policy</Link>
              </Button>
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link to="/terms">Terms</Link>
              </Button>
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <a href="mailto:support@stratacrm.app">Contact support</a>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card id="delete-account" className="border-destructive/20 bg-destructive/[0.03]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Delete account</CardTitle>
            <CardDescription>
              Delete this account from inside the app. This permanently removes sign-in access, linked identities,
              notifications, and workspace memberships.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0 text-sm">
            <div className="rounded-xl border bg-card px-4 py-3">
              <p className="font-medium text-foreground">Delete account</p>
              <p className="mt-1 text-muted-foreground">
                You will be signed out immediately after deletion. Apple, Google, and password sign-in for this
                account are disconnected as part of the delete flow.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <SecurityRow
                label="Workspace access"
                value={
                  workspaceAssociationCount > 0
                    ? `${workspaceAssociationCount} workspace link${workspaceAssociationCount === 1 ? "" : "s"}`
                    : "No workspace links"
                }
              />
              <SecurityRow label="Owned businesses" value={ownedBusinessCount > 0 ? String(ownedBusinessCount) : "None"} />
              <SecurityRow label="Linked staff" value={linkedStaffProfileCount > 0 ? String(linkedStaffProfileCount) : "None"} />
            </div>
            <div className="rounded-xl border border-dashed border-destructive/25 bg-background/80 px-4 py-3 text-xs text-muted-foreground">
              {retainedDataSummary.length > 0
                ? "Some issued billing, tax, or historical shop records may remain in anonymized form when legally or operationally required."
                : "No legal or accounting retention is currently expected for this account."}
            </div>
            {deletedDataSummary.length > 0 ? (
              <SummaryCard title="Will be deleted" items={deletedDataSummary} />
            ) : null}
            {retainedDataSummary.length > 0 ? (
              <SummaryCard title="Retained only if required" items={retainedDataSummary} />
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button variant="destructive" onClick={openDeleteAccount} className="w-full sm:w-auto">
                Delete account
              </Button>
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <a href="mailto:support@stratacrm.app?subject=Account%20deletion%20question">Questions before deleting?</a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This is permanent. If you need billing or tax documents preserved, Strata keeps only the minimum
              historical records required after your personal sign-in data is removed.
            </p>
          </CardContent>
        </Card>
      </section>

      <EditProfileModal
        open={isEditing}
        onClose={() => {
          setIsEditing(false);
          void refreshProfile();
        }}
      />
      <ChangePasswordModal
        open={isChangingPassword}
        onClose={() => {
          setIsChangingPassword(false);
          void refreshProfile();
        }}
      />
      <SetPasswordModal
        open={isSettingPassword}
        onClose={() => {
          setIsSettingPassword(false);
          void refreshProfile();
        }}
      />
      <DeleteAccountDialog
        open={isDeletingAccount}
        preview={accountDeletionPreview}
        onClose={() => {
          setIsDeletingAccount(false);
        }}
        onDeleted={(redirectPath) => {
          setIsDeletingAccount(false);
          clearAuthState("auth:logout", { reason: "account-deleted" });
          navigate(redirectPath, { replace: true });
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

function SummaryCard(props: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{props.title}</p>
      <ul className="mt-2 space-y-1.5 text-sm text-foreground">
        {props.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
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
    send: ["id", "firstName", "lastName"],
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
    if (currentPassword === newPassword) {
      setError("New password must be different from your current password.");
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
          <DialogDescription>
            Enter your current password and choose a new one for future sign-ins. If you do not know your current password, use reset password instead.
          </DialogDescription>
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
  const { user } = useOutletContext<AuthOutletContext>();
  const [{ fetching }, setPassword] = useAction(api.user.setPassword);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const connectedIdentityProviders = [
    user.appleSubject ? "Apple" : null,
    user.googleProfileId ? "Google" : null,
  ].filter(Boolean) as string[];

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
          <DialogTitle>{user.hasPassword ? "Reset password" : "Add password"}</DialogTitle>
          <DialogDescription>
            {connectedIdentityProviders.length > 0
              ? user.hasPassword
                ? `Choose a new password for this ${formatAuthMethodList(connectedIdentityProviders)}-connected account. Your existing sign-in methods will still work.`
                : `Add a password so this account can sign in without relying only on ${formatAuthMethodList(connectedIdentityProviders)}.`
              : "Add a password so this account can sign in directly with email and password."}
          </DialogDescription>
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

const DeleteAccountDialog = (props: {
  open: boolean;
  preview: AccountDeletionPreviewData;
  onClose: () => void;
  onDeleted: (redirectPath: string) => void;
}) => {
  const [{ fetching }, deleteAccount] = useAction(api.user.deleteAccount);
  const [step, setStep] = useState<"warning" | "confirm" | "success">("warning");
  const [confirmationText, setConfirmationText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const deletedDataSummary = props.preview.deletedDataSummary ?? [];
  const retainedDataSummary = props.preview.retainedDataSummary ?? [];

  const resetState = () => {
    setStep("warning");
    setConfirmationText("");
    setError(null);
  };

  const handleClose = () => {
    if (fetching || step === "success") return;
    trackEvent("account_deletion_closed", { step });
    resetState();
    props.onClose();
  };

  const handleDelete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    trackEvent("account_deletion_submitted");
    const result = await deleteAccount({ confirmationText });
    if (result.error) {
      trackEvent("account_deletion_failed");
      setError(result.error.message ?? "Could not delete your account.");
      return;
    }
    trackEvent("account_deletion_completed", {
      already_deleted: Boolean((result.data as { alreadyDeleted?: boolean } | null | undefined)?.alreadyDeleted),
      retained_records: retainedDataSummary.length > 0,
    });
    setStep("success");
    window.setTimeout(() => {
      resetState();
      props.onDeleted(
        String(
          (result.data as { redirectPath?: string } | null | undefined)?.redirectPath ??
            "/sign-in?accountDeleted=1"
        )
      );
    }, 900);
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) handleClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl" showCloseButton={!fetching && step !== "success"}>
        {step === "warning" ? (
          <>
            <DialogHeader>
              <DialogTitle>Delete account</DialogTitle>
              <DialogDescription>
                This permanently deletes your account and signs you out of Strata. Linked Apple, Google, and password
                sign-in for this account stop working immediately after deletion.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-2xl border border-destructive/25 bg-destructive/[0.04] px-4 py-3 text-sm text-foreground">
                <p className="font-medium">Before you continue</p>
                <p className="mt-1 text-muted-foreground">
                  This action cannot be undone. Your personal account data is removed now, and only the minimum
                  billing, tax, or historical shop records are kept when required.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <SummaryCard
                  title="Deleted now"
                  items={
                    deletedDataSummary.length > 0
                      ? deletedDataSummary
                      : ["Your sign-in credentials, profile details, and workspace access"]
                  }
                />
                <SummaryCard
                  title="Retained only if required"
                  items={
                    retainedDataSummary.length > 0
                      ? retainedDataSummary
                      : ["No legal or accounting retention is currently expected for this account."]
                  }
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={handleClose} type="button">
                  Cancel
                </Button>
                <Button variant="destructive" onClick={() => setStep("confirm")} type="button">
                  Continue to confirmation
                </Button>
              </div>
            </div>
          </>
        ) : null}

        {step === "confirm" ? (
          <>
            <DialogHeader>
              <DialogTitle>Final confirmation</DialogTitle>
              <DialogDescription>
                Type DELETE to confirm permanent account deletion. After this completes, Strata signs you out on this
                device and removes your linked login methods.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleDelete} className="space-y-5">
              <div className="grid items-center gap-3">
                <Label htmlFor="deleteAccountConfirmation">Type DELETE to confirm</Label>
                <Input
                  id="deleteAccountConfirmation"
                  value={confirmationText}
                  onChange={(event) => setConfirmationText(event.target.value)}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="DELETE"
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Nothing is deleted until you tap <span className="font-medium text-foreground">Delete account permanently</span>.
              </p>
              {error ? (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-left">
                  <p className="text-sm font-semibold text-destructive">We couldn&apos;t delete the account yet.</p>
                  <p className="mt-1 text-sm text-destructive/90">{error}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Nothing has been removed. Try again, or contact support if this keeps happening.
                  </p>
                </div>
              ) : null}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setStep("warning")} type="button">
                  Back
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={fetching || confirmationText.trim().toUpperCase() !== "DELETE"}
                >
                  {fetching ? "Deleting..." : "Delete account permanently"}
                </Button>
              </div>
            </form>
          </>
        ) : null}

        {step === "success" ? (
          <>
            <DialogHeader>
              <DialogTitle>Account deleted</DialogTitle>
              <DialogDescription>
                Your account was deleted successfully in the app. Signing you out now.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground">
              No extra website step is required. If you need retained billing or tax records from a previous workspace,
              contact support at{" "}
              <a href="mailto:support@stratacrm.app" className="font-medium text-foreground hover:underline">
                support@stratacrm.app
              </a>
              .
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
