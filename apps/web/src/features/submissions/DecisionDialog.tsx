import { useEffect, useState } from "react";
import { CheckCircle2, Mail, MailX, XCircle } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Label,
  Switch,
  Textarea,
  cn,
} from "@opensession/ui";

export interface DecisionPayload {
  notify: boolean;
  message: string | null;
}

/**
 * Confirms an accept/decline and lets the organizer attach a note.
 *
 * The note rides along in the decision email, which is what makes "ask for
 * changes / attach feedback" possible without leaving the app — otherwise a
 * decision arrives as a bare template with no explanation.
 */
export function DecisionDialog({
  open,
  onOpenChange,
  decision,
  count = 1,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which decision is being taken; drives copy and the confirm button's tone. */
  decision: "accepted" | "declined" | null;
  /** How many submissions this applies to — the bulk path passes >1. */
  count?: number;
  isPending?: boolean;
  onConfirm: (payload: DecisionPayload) => void;
}) {
  const [message, setMessage] = useState("");
  const [notify, setNotify] = useState(true);

  // A note is per-decision, never carried over to the next one.
  useEffect(() => {
    if (open) {
      setMessage("");
      setNotify(true);
    }
  }, [open]);

  if (!decision) return null;
  const accepting = decision === "accepted";
  const subject = count === 1 ? "this submission" : `${count} submissions`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-lg",
                accepting ? "bg-success/12 text-success" : "bg-destructive/12 text-destructive",
              )}
            >
              {accepting ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
            </span>
            {accepting ? "Accept" : "Decline"} {subject}
          </DialogTitle>
          <DialogDescription>
            {accepting
              ? "Accepting creates the session, adds the speakers to the event, and generates their onboarding tasks."
              : "The speakers will be told their submission was not selected."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="decision-message">
              Note to {count === 1 ? "the speaker" : "the speakers"} <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="decision-message"
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={!notify}
              placeholder={
                accepting
                  ? "e.g. Congratulations! Could you trim the abstract to 200 words before we publish it?"
                  : "e.g. A strong proposal, but we had three talks on this topic this year. Please do submit again."
              }
            />
            <p className="text-xs text-muted-foreground">
              {notify
                ? "Included in the decision email, above the standard footer."
                : "Notifications are off, so this note will not be sent."}
            </p>
          </div>

          <label className="flex items-center justify-between rounded-lg border border-border p-3">
            <span className="flex items-center gap-2 text-sm text-foreground">
              {notify ? (
                <Mail className="size-4 text-muted-foreground" />
              ) : (
                <MailX className="size-4 text-muted-foreground" />
              )}
              Email {count === 1 ? "the speaker" : "the speakers"}
            </span>
            <Switch checked={notify} onCheckedChange={setNotify} />
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={accepting ? "default" : "destructive"}
            disabled={isPending}
            onClick={() => onConfirm({ notify, message: notify ? message.trim() || null : null })}
          >
            {isPending ? "Working…" : accepting ? "Accept" : "Decline"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
