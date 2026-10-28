import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/common";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="py-16">
      <EmptyState title="Page not found" icon={Compass}>
        <p>The page you requested does not exist.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/">Back to executive overview</Link>
        </Button>
      </EmptyState>
    </div>
  );
}
