import { Link } from "react-router";
import { Car, PhoneCall, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "../components/shared/PageHeader";
import { EmptyState } from "../components/shared/EmptyState";

export default function VehiclesPage() {
  return (
    <div className="page-content page-section max-w-4xl">
      <PageHeader
        title="Vehicles"
      />

      <EmptyState
        icon={Car}
        title="Open a lead or client"
        action={
          <>
            <Button asChild>
              <Link to="/leads">
                <PhoneCall className="mr-2 h-4 w-4" />
                Open Lead Intake
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/clients">
                <UserPlus className="mr-2 h-4 w-4" />
                Open Clients
              </Link>
            </Button>
          </>
        }
      />
    </div>
  );
}
