import { Navigate } from "react-router";

export default function AdminRecoveryRedirect() {
  return <Navigate to="/signed-in" replace />;
}
