"use client";

import { Loader2 } from "lucide-react";
import React, { useEffect,useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type { Contact, CreateContactInput, LeadStatus } from "./types";

interface ContactEditorModalProps {
  contact?: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (contact: Contact) => void;
}

export function ContactEditorModal({
  contact,
  open,
  onOpenChange,
  onSaved,
}: ContactEditorModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [status, setStatus] = useState<LeadStatus>("new");
  const [tagsInput, setTagsInput] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (contact) {
      setName(contact.name || "");
      setEmail(contact.email || "");
      setPhone(contact.phone || "");
      setCompany(contact.company || "");
      setRole(contact.role || "");
      setEstimatedValue(contact.estimatedValue || "");
      setStatus(contact.status || "new");
      setTagsInput(contact.tags ? contact.tags.join(", ") : "");
      setNotes(contact.notes || "");
    } else {
      setName("");
      setEmail("");
      setPhone("");
      setCompany("");
      setRole("");
      setEstimatedValue("");
      setStatus("new");
      setTagsInput("");
      setNotes("");
    }
  }, [contact, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Contact name is required");
      return;
    }

    setSubmitting(true);
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const payload: CreateContactInput = {
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      company: company.trim() || null,
      role: role.trim() || null,
      estimatedValue: estimatedValue.trim() || null,
      status,
      tags,
      notes: notes.trim(),
    };

    try {
      const url = contact
        ? `/api/business/contacts/${contact.id}`
        : `/api/business/contacts`;
      const method = contact ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to save contact");
      }

      const json = await res.json();
      toast.success(contact ? "Contact updated" : "Contact created");
      onSaved(json.data);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error saving contact");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{contact ? "Edit Contact" : "Add New Contact"}</DialogTitle>
            <DialogDescription>
              {contact
                ? "Update contact details and CRM qualification."
                : "Create a verified contact record scoped to your organization."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Full Name *</Label>
              <Input
                placeholder="e.g. Sarah Jenkins"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                placeholder="sarah@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Phone</Label>
              <Input
                placeholder="+1 (555) 000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Company</Label>
              <Input
                placeholder="Acme Corp"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Role / Title</Label>
              <Input
                placeholder="VP Engineering"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Lifecycle Status</Label>
              <Select value={status} onValueChange={(val) => setStatus(val as LeadStatus)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="qualified">Qualified</SelectItem>
                  <SelectItem value="nurturing">Nurturing</SelectItem>
                  <SelectItem value="booked">Booked</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Est. Value</Label>
              <Input
                placeholder="$25,000 / yr"
                value={estimatedValue}
                onChange={(e) => setEstimatedValue(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Tags (comma-separated)</Label>
              <Input
                placeholder="enterprise, outbound-q4, vip"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Initial Notes</Label>
              <Textarea
                placeholder="Background details, intent, or conversation context..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="text-xs resize-none"
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              {contact ? "Update Contact" : "Create Contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
