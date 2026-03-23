import { Navigate } from "react-router";

/** Advanced reporting is disabled until the core product is stable. */
export default function AnalyticsRedirect() {
  return <Navigate to="/signed-in" replace />;
}
