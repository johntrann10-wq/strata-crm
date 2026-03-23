import { Navigate } from "react-router";

export default function LapsedClientsRedirect() {
  return <Navigate to="/signed-in" replace />;
}
