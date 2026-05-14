import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { StickyNote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/** Yellow post-it button used by clients to attach a note to an order. */
export function ClientNoteButton({
  orderId,
  initialNote,
  disabled,
  size = "md",
}: {
  orderId?: string | null;
  initialNote: string | null;
  disabled?: boolean;
  size?: "sm" | "md";
  /** When orderId is null, the parent stores the draft. */
  onLocalChange?: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(initialNote ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setNote(initialNote ?? ""); }, [initialNote]);

  async function save() {
    if (!orderId) { setOpen(false); return; }
    setSaving(true);
    const { error } = await supabase.from("orders")
      .update({ note: note.trim() || null, note_seen_by_admin: false })
      .eq("id", orderId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Note enregistrée");
    setOpen(false);
  }

  const has = !!(initialNote && initialNote.trim());
  const dim = size === "sm" ? "h-7 px-2 text-[10px]" : "h-8 px-3 text-xs";

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-md font-semibold uppercase tracking-wider ring-1 ring-yellow-500/40 bg-yellow-200 text-yellow-900 hover:bg-yellow-300 transition shadow-sm ${dim} disabled:opacity-50`}
        title={has ? "Modifier la note" : "Ajouter une note"}
      >
        <StickyNote className="size-3.5" />
        {has ? "Note" : "Note"}
        {has && <span className="ml-0.5 size-1.5 rounded-full bg-yellow-700" />}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Note pour cette commande</DialogTitle></DialogHeader>
          <div className="rounded-md bg-yellow-100 ring-1 ring-yellow-300 p-3">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Indiquez ici un commentaire pour la cuisine…"
              className="bg-transparent border-none focus-visible:ring-0 min-h-[140px] resize-none text-yellow-950 placeholder:text-yellow-800/50"
              maxLength={1000}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Yellow square on admin dashboard. Blinks if not yet seen. */
export function AdminNoteCell({
  orderId,
  note,
  seen,
}: { orderId: string; note: string | null; seen: boolean }) {
  const [open, setOpen] = useState(false);
  const [keepUnread, setKeepUnread] = useState(false);
  const has = !!(note && note.trim());

  if (!has) return null;

  async function openAndMarkSeen() {
    setKeepUnread(false);
    setOpen(true);
    if (!seen) {
      await supabase.from("orders").update({ note_seen_by_admin: true }).eq("id", orderId);
    }
  }

  async function close() {
    if (keepUnread) {
      await supabase.from("orders").update({ note_seen_by_admin: false }).eq("id", orderId);
    }
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={openAndMarkSeen}
        className={`inline-block size-3.5 rounded-sm bg-yellow-300 ring-1 ring-yellow-600/50 align-middle ${seen ? "" : "note-blink"}`}
        title={seen ? "Note (lue)" : "Nouvelle note !"}
        aria-label="Voir la note"
      />
      <Dialog open={open} onOpenChange={(o) => o ? setOpen(true) : close()}>
        <DialogContent>
          <DialogHeader><DialogTitle>Note du client</DialogTitle></DialogHeader>
          <div className="rounded-md bg-yellow-100 ring-1 ring-yellow-300 p-4 whitespace-pre-wrap text-yellow-950 text-sm min-h-[140px]">
            {note}
          </div>
          <DialogFooter className="items-center gap-3 sm:justify-between">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Checkbox checked={keepUnread} onCheckedChange={(v) => setKeepUnread(!!v)} />
              Remettre en non-lu en refermant
            </label>
            <Button onClick={close}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
