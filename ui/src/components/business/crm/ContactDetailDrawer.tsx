"use client";

import {
  Calendar,
  Clock,
  Loader2,
  Mail,
  Phone,
  Send,
  Sparkles,
  Workflow,
} from "lucide-react";
import React, { useCallback,useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import type { Contact, Interaction,TimelineEvent } from "./types";

interface ContactDetailDrawerProps {
  contact: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContactUpdated: (contact: Contact) => void;
}

export function ContactDetailDrawer({
  contact,
  open,
  onOpenChange,
  onContactUpdated,
}: ContactDetailDrawerProps) {
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const fetchHistory = useCallback(async (contactId: string) => {
    setLoadingHistory(true);
    try {
      const [tlRes, intRes] = await Promise.all([
        fetch(`/api/business/contacts/${contactId}/timeline`),
        fetch(`/api/business/interactions?contactId=${contactId}`),
      ]);
      if (tlRes.ok) {
        const json = await tlRes.json();
        setTimeline(json.data || []);
      }
      if (intRes.ok) {
        const json = await intRes.json();
        setInteractions(json.data || []);
      }
    } catch {
      // Non-blocking history load
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (contact && open) {
      void fetchHistory(contact.id);
      setNewNote("");
    }
  }, [contact, open, fetchHistory]);

  if (!contact) return null;

  const handleAppendNote = async () => {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      const appended = contact.notes
        ? `${contact.notes}\n[${new Date().toLocaleDateString()}]: ${newNote.trim()}`
        : `[${new Date().toLocaleDateString()}]: ${newNote.trim()}`;

      const res = await fetch(`/api/business/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: appended }),
      });
      if (!res.ok) throw new Error("Failed to update notes");
      const json = await res.json();
      onContactUpdated(json.data);
      setNewNote("");
      toast.success("Note saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error saving note");
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-6">
        <SheetHeader className="space-y-1 pb-4 border-b">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="capitalize text-xs font-semibold">
              {contact.status}
            </Badge>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span>Score: <strong>{contact.leadScore ?? "N/A"}</strong>/100</span>
            </div>
          </div>
          <SheetTitle className="text-xl font-bold">{contact.name}</SheetTitle>
          <SheetDescription className="flex items-center gap-2 text-xs">
            {contact.role && <span>{contact.role}</span>}
            {contact.role && contact.company && <span>•</span>}
            {contact.company && <span className="font-medium text-foreground">{contact.company}</span>}
          </SheetDescription>
        </SheetHeader>

        {/* Quick Contact & Info Grid */}
        <div className="grid grid-cols-2 gap-3 py-4 text-xs border-b">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate text-foreground font-mono">{contact.phone || "No phone"}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate text-foreground">{contact.email || "No email"}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>Calls: <strong className="text-foreground">{contact.callAttempts}</strong></span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Est: <strong className="text-foreground">{contact.estimatedValue || "N/A"}</strong></span>
          </div>
        </div>

        {/* Tags */}
        {contact.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 py-3 border-b">
            {contact.tags.map((t) => (
              <Badge key={t} variant="secondary" className="text-[11px] font-normal">
                #{t}
              </Badge>
            ))}
          </div>
        )}

        {/* History and Tabs */}
        <Tabs defaultValue="timeline" className="mt-4">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="timeline" className="text-xs">Timeline</TabsTrigger>
            <TabsTrigger value="interactions" className="text-xs">
              Calls ({interactions.length})
            </TabsTrigger>
            <TabsTrigger value="notes" className="text-xs">Notes</TabsTrigger>
          </TabsList>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="space-y-3 pt-3">
            {loadingHistory ? (
              <div className="flex justify-center py-6 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /></div>
            ) : timeline.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No timeline events recorded.</p>
            ) : (
              <div className="space-y-2.5">
                {timeline.map((event) => (
                  <div key={event.id} className="text-xs p-2.5 rounded-md border bg-muted/30 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground capitalize">{event.event.replace(/_/g, " ")}</span>
                      <span className="text-[10px] text-muted-foreground">{new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {event.details && <p className="text-muted-foreground text-[11px]">{event.details}</p>}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Interactions Tab */}
          <TabsContent value="interactions" className="space-y-3 pt-3">
            {loadingHistory ? (
              <div className="flex justify-center py-6 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /></div>
            ) : interactions.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No calls or voice interactions logged.</p>
            ) : (
              <div className="space-y-2.5">
                {interactions.map((int) => (
                  <div key={int.id} className="text-xs p-3 rounded-md border bg-card space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Workflow className="w-3.5 h-3.5 text-primary" />
                        <span className="font-semibold">Workflow #{int.dograhWorkflowId ?? "Direct"}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px]">{int.direction} • {int.durationSeconds}s</Badge>
                    </div>
                    <p className="text-muted-foreground text-xs">{int.summary || "No call summary."}</p>
                    {int.dograhRunId && (
                      <div className="text-[10px] text-muted-foreground font-mono pt-1">
                        Run ID: {int.dograhRunId}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent value="notes" className="space-y-3 pt-3">
            <div className="space-y-2">
              <Textarea
                placeholder="Type a new activity note or conversation memo..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                rows={3}
                className="text-xs resize-none"
              />
              <div className="flex justify-end">
                <Button size="sm" onClick={handleAppendNote} disabled={savingNote || !newNote.trim()}>
                  {savingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
                  Append Note
                </Button>
              </div>
            </div>

            {contact.notes ? (
              <div className="border rounded-md p-3 bg-muted/20 text-xs whitespace-pre-wrap font-sans text-muted-foreground max-h-48 overflow-y-auto">
                {contact.notes}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">No notes on record.</p>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
