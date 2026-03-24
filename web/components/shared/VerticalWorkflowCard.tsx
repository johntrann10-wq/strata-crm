import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getVerticalWorkflowGuide } from "../../lib/verticalWorkflowGuide";

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge key={item} variant="outline" className="rounded-full">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export function VerticalWorkflowCard({
  businessType,
  mode,
}: {
  businessType: string | null | undefined;
  mode: "appointment" | "job";
}) {
  const guide = getVerticalWorkflowGuide(businessType);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "appointment" ? "Intake focus" : "Work-order focus"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">{guide.title}</p>
          <p className="text-sm text-muted-foreground">{guide.summary}</p>
        </div>
        <Section title="Capture" items={guide.intakeFields} />
        <Section title="Execute" items={guide.executionFocus} />
        <Section title="Closeout" items={guide.deliveryFocus} />
      </CardContent>
    </Card>
  );
}
