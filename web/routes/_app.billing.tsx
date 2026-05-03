import { Navigate } from "react-router";

export default function BillingRoute() {
  return <Navigate to="/settings?tab=billing" replace />;
}
