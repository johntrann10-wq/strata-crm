import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface User {
  firstName: string | null;
  lastName: string | null;
  email: string;
  profilePicture: {
    url: string;
  } | null;
  googleImageUrl: string | null;
}

export const UserIcon = ({ user, className }: { user: User; className?: string }) => {
  return (
    <>
      <Avatar className={className}>
        <AvatarImage src={user.profilePicture?.url ?? user.googleImageUrl ?? ""} alt={user.firstName ?? user.email} />
        <AvatarFallback>{getInitials(user)}</AvatarFallback>
      </Avatar>
    </>
  );
};

const getInitials = (user: User) => {
  const firstInitial = typeof user.firstName === "string" ? user.firstName.slice(0, 1) : "";
  const lastInitial = typeof user.lastName === "string" ? user.lastName.slice(0, 1) : "";

  if (firstInitial || lastInitial) {
    return `${firstInitial}${lastInitial}`.toUpperCase();
  }

  return typeof user.email === "string" && user.email.length > 0 ? user.email.slice(0, 1) : "?";
};
