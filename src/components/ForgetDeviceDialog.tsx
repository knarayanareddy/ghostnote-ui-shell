import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { forgetThisDevice } from "@/lib/session";

/**
 * The only way to end a session in Kindling (S-7). Deliberately explicit about
 * what it does *not* do: the notes you already sent or received stay where they
 * are, they just stop being reachable from this browser.
 */
const ForgetDeviceDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
  const [working, setWorking] = useState(false);

  const handleConfirm = async () => {
    setWorking(true);
    await forgetThisDevice();
    // A fresh anonymous identity is created on next load, with an empty journal.
    window.location.assign("/");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Forget this device?</DialogTitle>
          <DialogDescription>
            This signs out of the anonymous session and clears it from this browser. Anything
            that happens next gets a fresh identity and an empty journal — useful on a shared
            or borrowed device.
          </DialogDescription>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Notes you already sent or received are not deleted. You just won't be able to reach
          them from this browser again.
        </p>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={working}>
            Cancel
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={working}>
            {working ? "Forgetting…" : "Forget this device"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ForgetDeviceDialog;
