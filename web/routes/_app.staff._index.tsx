import { Navigate } from "react-router";

export default function StaffRedirect() {
  return <Navigate to="/signed-in" replace />;
}
