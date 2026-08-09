import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import type { Communication } from "@opensession/schemas";
import { createColumnHelper, DataTable } from "../../components/data-table";
import { communicationsApi } from "../../api";
import { useCurrentEvent } from "../../lib/current-event";
import { PageHeader } from "../../layouts/organizer-shell";
import { CommsSubNav } from "./CommsSubNav";
import { StatusPill, COMMUNICATION_STATUS_TONE } from "../../components/status-pill";

const columnHelper = createColumnHelper<Communication>();

export function CommunicationsHistoryPage() {
  const { eventId } = useCurrentEvent();
  const { data = [], isLoading } = useQuery({ queryKey: ["communications", eventId], queryFn: () => communicationsApi.history(eventId) });

  const columns = [
    columnHelper.accessor("recipient_email", { header: "Recipient" }),
    columnHelper.accessor("status", { header: "Status", cell: (info) => <StatusPill label={info.getValue()} tone={COMMUNICATION_STATUS_TONE[info.getValue()] ?? "neutral"} /> }),
    columnHelper.accessor("sent_at", { header: "Sent at", cell: (info) => (info.getValue() ? new Date(info.getValue()!).toLocaleString() : "—") }),
    columnHelper.accessor("error_message", { header: "Error", cell: (info) => info.getValue() ?? "—" }),
  ];

  return (
    <div>
      <PageHeader icon={History} title="Templates & Automations" subtitle="Communication history for this event." actions={<CommsSubNav eventId={eventId} active="history" />} />
      <div className="px-6 py-6">
        <DataTable columns={columns} data={data} getRowId={(row) => row.id} isLoading={isLoading} searchPlaceholder="Search history..." emptyTitle="No communications sent yet" />
      </div>
    </div>
  );
}
