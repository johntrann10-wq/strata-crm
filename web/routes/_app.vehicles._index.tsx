import { Link } from "react-router";
import { Car, PhoneCall, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "../components/shared/PageHeader";
import { EmptyState } from "../components/shared/EmptyState";

export default function VehiclesPage() {
  return (
    <div className="page-content page-section max-w-4xl">
      <PageHeader
        title="Vehicles Live Inside Client Records"
        subtitle="Vehicle intake still exists, but it now starts from a lead or client so the car stays attached to the right person, appointment, quote, and invoice."
      />

      <EmptyState
        icon={Car}
        title="No separate vehicle workspace"
        description="Use Lead Intake when someone calls in, or open a client record and add the vehicle there. That keeps the workflow tighter and removes one extra CRM page."
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
