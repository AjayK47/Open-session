import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import { CheckCircle2, LoaderCircle, Megaphone, TriangleAlert } from "lucide-react";
import { Button } from "@opensession/ui";
import { organizationApi, ApiError } from "../../api";
import { ORGANIZATION_CONTEXT_KEY } from "../../lib/organization";

export function InvitationAcceptPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) { setState("error"); setMessage("This invitation link is incomplete."); return; }
    organizationApi.accept(token).then(async () => { await queryClient.invalidateQueries({ queryKey: ORGANIZATION_CONTEXT_KEY }); setState("done"); window.setTimeout(() => navigate("/app/events", { replace: true }), 900); }).catch(error => { setState("error"); setMessage(error instanceof ApiError ? error.message2 : "This invitation could not be accepted."); });
  }, [navigate, queryClient, token]);

  return <div className="flex min-h-screen items-center justify-center bg-[#f3f0e8] px-6"><div className="w-full max-w-md rounded-2xl border border-[#d6d0c3] bg-white p-8 text-center shadow-[0_24px_70px_rgba(54,49,39,.12)]"><span className="mx-auto flex size-10 items-center justify-center rounded-xl bg-[#ef5b36] text-white"><Megaphone className="size-4.5" /></span>{state === "working" && <><LoaderCircle className="mx-auto mt-8 size-8 animate-spin text-[#ef5b36]" /><h1 className="mt-4 text-xl font-semibold">Joining your workspace…</h1></>}{state === "done" && <><CheckCircle2 className="mx-auto mt-8 size-9 text-success" /><h1 className="mt-4 text-xl font-semibold">Invitation accepted</h1><p className="mt-2 text-sm text-muted-foreground">Opening your event workspace now.</p></>}{state === "error" && <><TriangleAlert className="mx-auto mt-8 size-9 text-destructive" /><h1 className="mt-4 text-xl font-semibold">Couldn’t accept invitation</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p><Button asChild className="mt-6"><Link to="/">Return home</Link></Button></>}</div></div>;
}
