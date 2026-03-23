import { Navigate } from "react-router";

export default function InventoryRedirect() {
  return <Navigate to="/signed-in" replace />;
}
