import { CUSTOMER_HEALTH, type Customer, type CustomerHealth } from "@shared/domain";
import { Loader2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Field } from "@/components/common/misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { useSaveCustomer } from "@/lib/queries";

const empty = { name: "", email: "", phone: "", company: "", health: "Active" as CustomerHealth, notes: "" };

export function CustomerDialog({
  open,
  onOpenChange,
  customer,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customer?: Customer | null;
  onSaved?: (c: Customer) => void;
}) {
  const save = useSaveCustomer(customer?.id);
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    if (open) {
      setErrors({});
      setForm(
        customer
          ? {
              name: customer.name,
              email: customer.email,
              phone: customer.phone ?? "",
              company: customer.company ?? "",
              health: customer.health,
              notes: customer.notes ?? "",
            }
          : empty,
      );
    }
  }, [open, customer]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 2) errs.name = "Enter at least 2 characters";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = "Enter a valid email address";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      const c = await save.mutateAsync({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        company: form.company.trim() || null,
        health: form.health,
        notes: form.notes.trim() || null,
      });
      toast.success(customer ? "Customer updated" : "Customer added");
      onOpenChange(false);
      onSaved?.(c);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setErrors({ email: err.message });
      else toast.error((err as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>{customer ? "Edit customer" : "Add customer"}</DialogTitle>
            <DialogDescription>Customers are the people who raise tickets with your team.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-5 sm:grid-cols-2">
            <Field label="Full name" error={errors.name}>
              <Input value={form.name} onChange={set("name")} autoFocus />
            </Field>
            <Field label="Email" error={errors.email}>
              <Input type="email" value={form.email} onChange={set("email")} />
            </Field>
            <Field label="Company">
              <Input value={form.company} onChange={set("company")} />
            </Field>
            <Field label="Phone">
              <Input type="tel" value={form.phone} onChange={set("phone")} />
            </Field>
            <Field label="Account health">
              <Select value={form.health} onValueChange={(v) => setForm((f) => ({ ...f, health: v as CustomerHealth }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOMER_HEALTH.map((h) => (
                    <SelectItem key={h} value={h}>{h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes" hint="Context your team should know — plan, preferences, key contacts.">
                <Textarea value={form.notes} onChange={set("notes")} rows={3} />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />} {customer ? "Save changes" : "Add customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
