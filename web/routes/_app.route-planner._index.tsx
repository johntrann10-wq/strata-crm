import { Navigate } from "react-router";

export default function RoutePlannerRedirect() {
  return <Navigate to="/signed-in" replace />;
}
