"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type ModelRequiredModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ModelRequiredModal({
  open,
  onOpenChange,
}: ModelRequiredModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Select a model first</DialogTitle>
          <DialogDescription>
            You need to choose an AI model before sending a message. Please
            open the model picker, select a model, and try again.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
