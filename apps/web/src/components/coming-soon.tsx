import { Construction } from "lucide-react";
import { PageHeader } from "../layouts/organizer-shell";
import { EmptyState } from "./empty-state";

export function ComingSoon({ title }: { title: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <div className="px-6 py-6">
        <EmptyState icon={Construction} title="Under construction" description="This page is being built." />
      </div>
    </div>
  );
}
