import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

interface ReportDialogProps {
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReported: () => void;
}

const ReportDialog = ({ noteId, open, onOpenChange, onReported }: ReportDialogProps) => {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleReport = async () => {
    setSubmitting(true);
    const { error } = await supabase.rpc("report_note", {
      p_note_id: noteId,
      p_reason: reason.trim() || null,
    });
    setSubmitting(false);

    if (error) {
      console.error("report_note RPC failed:", error);
      toast.error("Couldn't report this note. Please try again.");
      return;
    }

    setReason("");
    onReported();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report this note as unkind?</DialogTitle>
          <DialogDescription>
            This will remove the note and help keep Kindling safe.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="resize-none"
          maxLength={300}
        />
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleReport} disabled={submitting}>
            {submitting ? "Reporting…" : "Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReportDialog;
