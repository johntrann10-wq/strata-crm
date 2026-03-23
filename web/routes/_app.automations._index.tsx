import { Navigate } from "react-router";

export default function AutomationsRedirect() {
  return <Navigate to="/signed-in" replace />;
}
