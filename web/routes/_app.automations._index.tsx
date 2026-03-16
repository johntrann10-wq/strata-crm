import { useState, useEffect } from "react";
import { useGlobalAction, useFindMany } from "../hooks/useApi";
import { api } from "../api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar,
  CheckCircle,
  FileText,
  Wrench,
  Users,
  Zap,
  ChevronDown,
  ChevronUp,
  Play,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

function getRuleIconAndColor(triggerType: string): {
  Icon: React.ElementType;
  colorClass: string;
  bgClass: string;
} {
  switch (triggerType) {
    case "job-completed":
      return { Icon: CheckCircle, colorClass: "text-green-500", bgClass: "bg-green-500/10" };
    case "invoice-unpaid":
      return { Icon: FileText, colorClass: "text-purple-500", bgClass: "bg-purple-500/10" };
    case "appointment-reminder":
      return { Icon: Calendar, colorClass: "text-blue-500", bgClass: "bg-blue-500/10" };
    case "service-interval":
      return { Icon: Wrench, colorClass: "text-orange-500", bgClass: "bg-orange-500/10" };
    case "lapsed-client":
      return { Icon: Users, colorClass: "text-teal-500", bgClass: "bg-teal-500/10" };
    default:
      return { Icon: Zap, colorClass: "text-gray-500", bgClass: "bg-gray-500/10" };
  }
}

function getDelayHelperText(triggerType: string): string | null {
  switch (triggerType) {
    case "appointment-reminder":
      return "Hours before the appointment to send the reminder (e.g. 24 = 1 day ahead)";
    case "job-completed":
      return "Hours after job completion before sending the review request";
    case "invoice-unpaid":
      return "Hours after the due date before sending a payment reminder";
    case "lapsed-client":
      return "Hours since last visit (e.g. 2160 = 90 days). Clients inactive longer will receive a win-back email.";
    case "service-interval":
      return null;
    default:
      return null;
  }
}

export default function AutomationsPage() {
  const [{ data: rulesData, fetching: fetchingRules }, runGetRules] = useGlobalAction(
    (api as any).getAutomationRules
  );
  const [{ fetching: saving }, runSave] = useGlobalAction((api as any).saveAutomationRule);
  const [{ fetching: running }, runNow] = useGlobalAction((api as any).runAutomations);
  const [{ data: logs, fetching: fetchingLogs }] = useFindMany(api.automationLog, {
    sort: { createdAt: "Descending" },
    first: 50,
    select: {
      id: true,
      triggerType: true,
      status: true,
      recipientName: true,
      recipientEmail: true,
      reason: true,
      createdAt: true,
    },
  });

  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [localEdits, setLocalEdits] = useState<
    Record<string, { delayHours: number; customMessage: string }>
  >({});

  useEffect(() => {
    void runGetRules();
  }, []);

  const rules: any[] = (rulesData as any)?.rules ?? [];

  const handleToggle = async (rule: any) => {
    await runSave({
      ruleId: rule.id ?? undefined,
      triggerType: rule.triggerType,
      enabled: !rule.enabled,
      delayHours: rule.delayHours,
      customMessage: rule.customMessage ?? "",
    });
    await runGetRules();
    toast.success(`Automation ${!rule.enabled ? "enabled" : "disabled"}`);
  };

  const handleSave = async (rule: any) => {
    const edits = localEdits[rule.triggerType];
    await runSave({
      ruleId: rule.id ?? undefined,
      triggerType: rule.triggerType,
      enabled: rule.enabled,
      delayHours: edits?.delayHours ?? rule.delayHours,
      customMessage: edits?.customMessage ?? rule.customMessage ?? "",
    });
    await runGetRules();
    setLocalEdits((prev) => {
      const next = { ...prev };
      delete next[rule.triggerType];
      return next;
    });
    toast.success("Automation updated");
  };

  const handleRunNow = async () => {
    await runNow();
    await runGetRules();
    toast.success("Automations ran successfully");
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="h-6 w-6 text-orange-500" />
            <h1 className="text-2xl font-bold tracking-tight">Automations</h1>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Configure automatic emails and actions that run your shop hands-free.
          </p>
        </div>
        <Button onClick={() => void handleRunNow()} disabled={running} variant="outline" size="sm">
          {running ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          Run Now
        </Button>
      </div>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="log">Activity Log</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-4">
          {fetchingRules ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-36 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {rules.map((rule: any) => {
                const { Icon, colorClass, bgClass } = getRuleIconAndColor(rule.triggerType);
                const isExpanded = expandedRule === rule.triggerType;
                const edits = localEdits[rule.triggerType];
                const delayHelp = getDelayHelperText(rule.triggerType);
                return (
                  <Card
                    key={rule.triggerType}
                    className={cn(
                      "border-border transition-colors",
                      rule.enabled && "border-primary/30"
                    )}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "h-9 w-9 rounded-md flex items-center justify-center shrink-0 mt-0.5",
                            bgClass
                          )}
                        >
                          <Icon className={cn("h-5 w-5", colorClass)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-sm font-semibold">{rule.label}</CardTitle>
                            <div className="flex items-center gap-2 shrink-0">
                              <Switch
                                checked={rule.enabled}
                                onCheckedChange={() => void handleToggle(rule)}
                                disabled={saving}
                              />
                              <Badge
                                variant={rule.enabled ? "default" : "secondary"}
                                className="text-xs"
                              >
                                {rule.enabled ? "Active" : "Off"}
                              </Badge>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 leading-snug">
                            {rule.description}
                          </p>
                          {rule.lastRunAt ? (
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <Clock className="h-3 w-3" /> Last run{" "}
                              {formatDistanceToNow(new Date(rule.lastRunAt), { addSuffix: true })}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground mt-1">Never run</p>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
                        onClick={() => setExpandedRule(isExpanded ? null : rule.triggerType)}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                        {isExpanded ? "Hide settings" : "Configure"}
                      </button>

                      {isExpanded && (
                        <div className="mt-3 space-y-3 border-t pt-3">
                          {delayHelp && (
                            <div className="space-y-1.5">
                              <Label className="text-xs">Delay (hours)</Label>
                              <Input
                                type="number"
                                min={0}
                                max={8760}
                                value={edits?.delayHours ?? rule.delayHours}
                                onChange={(e) =>
                                  setLocalEdits((prev) => ({
                                    ...prev,
                                    [rule.triggerType]: {
                                      ...prev[rule.triggerType],
                                      delayHours: parseInt(e.target.value) || 0,
                                      customMessage:
                                        prev[rule.triggerType]?.customMessage ??
                                        rule.customMessage ??
                                        "",
                                    },
                                  }))
                                }
                                className="h-8 text-sm w-32"
                              />
                              <p className="text-xs text-muted-foreground">{delayHelp}</p>
                            </div>
                          )}
                          <div className="space-y-1.5">
                            <Label className="text-xs">Custom Message (optional)</Label>
                            <Textarea
                              placeholder="Leave blank to use the default message..."
                              rows={3}
                              className="text-sm resize-none"
                              value={edits?.customMessage ?? rule.customMessage ?? ""}
                              onChange={(e) =>
                                setLocalEdits((prev) => ({
                                  ...prev,
                                  [rule.triggerType]: {
                                    ...prev[rule.triggerType],
                                    customMessage: e.target.value,
                                    delayHours:
                                      prev[rule.triggerType]?.delayHours ?? rule.delayHours,
                                  },
                                }))
                              }
                            />
                          </div>
                          <Button
                            size="sm"
                            onClick={() => void handleSave(rule)}
                            disabled={saving}
                          >
                            {saving ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            ) : null}
                            Save Changes
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="log" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {fetchingLogs ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-10 bg-muted animate-pulse rounded" />
                  ))}
                </div>
              ) : !logs || logs.length === 0 ? (
                <div className="py-12 text-center">
                  <Zap className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No automation activity yet. Enable a rule and run your first automation.
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {logs.map((log: any, idx: number) => (
                    <div
                      key={log.id}
                      className={cn(
                        "flex items-start gap-3 py-2.5",
                        idx < logs.length - 1 && "border-b border-border/50"
                      )}
                    >
                      <div className="mt-0.5 shrink-0">
                        {log.status === "sent" && (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        )}
                        {log.status === "failed" && (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        {log.status === "skipped" && (
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">
                            {log.recipientName ?? "Unknown"}
                          </span>
                          {log.recipientEmail && (
                            <span className="text-xs text-muted-foreground">
                              {log.recipientEmail}
                            </span>
                          )}
                          <Badge variant="outline" className="text-xs capitalize">
                            {(log.triggerType ?? "").replace(/-/g, " ")}
                          </Badge>
                        </div>
                        {log.reason && (
                          <p className="text-xs text-muted-foreground mt-0.5">{log.reason}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {log.createdAt
                          ? formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })
                          : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}