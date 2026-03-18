import { Button } from "@/components/ui/button";

// SPA mode catch-all 404 page: no loader/action exports here.
export default function NotFound() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto px-4 py-16 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="flex flex-col gap-7">
          <h1 className="text-6xl font-bold text-foreground">Coming soon</h1>
          <h2 className="text-3xl font-semibold text-foreground">That page isn’t available yet</h2>
          <Button asChild>
            <a href="/signed-in">Back to dashboard</a>
          </Button>
        </div>
      </div>
    </div>
  );
}