"use client";

import {
  ChevronLeft,
  ChevronRight,
  Edit2,
  Loader2,
  Plus,
  Search,
  Trash2,
  UploadCloud,
  Users,
} from "lucide-react";
import React, { useCallback,useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { ContactDetailDrawer } from "./ContactDetailDrawer";
import { ContactEditorModal } from "./ContactEditorModal";
import { LeadUploadModal } from "./LeadUploadModal";
import type { Contact, LeadStatus } from "./types";

export function ContactsDirectoryView() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const fetchContacts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", String(pageSize));
      params.set("offset", String((page - 1) * pageSize));

      const res = await fetch(`/api/business/contacts?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load contacts");
      const json = await res.json();
      setContacts(json.data || []);
      setTotal(json.total || 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error fetching contacts");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page, pageSize]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchContacts();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchContacts]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  const handleStatusChange = (val: string) => {
    setStatusFilter(val);
    setPage(1);
  };

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;

    try {
      const res = await fetch(`/api/business/contacts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete contact");
      toast.success("Contact deleted");
      if (selectedContact?.id === id) {
        setIsDrawerOpen(false);
        setSelectedContact(null);
      }
      void fetchContacts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error deleting contact");
    }
  };

  const getStatusBadge = (status: LeadStatus) => {
    const variants: Record<LeadStatus, "default" | "secondary" | "outline"> = {
      new: "outline",
      contacted: "secondary",
      qualified: "default",
      nurturing: "secondary",
      booked: "default",
      closed: "outline",
    };
    return (
      <Badge variant={variants[status] || "outline"} className="capitalize text-[11px]">
        {status}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Filter and Action Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Search leads, email, phone..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>

          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="qualified">Qualified</SelectItem>
              <SelectItem value="nurturing">Nurturing</SelectItem>
              <SelectItem value="booked">Booked</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsUploadOpen(true)}
            className="h-8 text-xs"
          >
            <UploadCloud className="w-3.5 h-3.5 mr-1.5" />
            Import CSV
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditingContact(null);
              setIsEditorOpen(true);
            }}
            className="h-8 text-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Contact
          </Button>
        </div>
      </div>

      {/* Contacts Table */}
      <div className="border rounded-md bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Contact</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Score</TableHead>
              <TableHead className="text-xs">Communication</TableHead>
              <TableHead className="text-xs">Calls</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground text-xs">
                  <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1 text-primary" />
                  Loading organization leads...
                </TableCell>
              </TableRow>
            ) : contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground text-xs">
                  <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  No contacts found. Create a contact or import via CSV to begin.
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => {
                    setSelectedContact(c);
                    setIsDrawerOpen(true);
                  }}
                >
                  <TableCell className="font-medium text-xs">
                    <div className="font-semibold text-foreground">{c.name}</div>
                    {(c.company || c.role) && (
                      <div className="text-[11px] text-muted-foreground">
                        {c.role ? `${c.role} ` : ""}
                        {c.company ? `@ ${c.company}` : ""}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{getStatusBadge(c.status)}</TableCell>
                  <TableCell className="text-xs">
                    {c.leadScore !== null && c.leadScore !== undefined ? (
                      <span className="font-semibold">{c.leadScore}</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <div className="truncate max-w-[180px]">{c.email || c.phone || "None"}</div>
                  </TableCell>
                  <TableCell className="text-xs font-mono">{c.callAttempts}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditingContact(c);
                          setIsEditorOpen(true);
                        }}
                      >
                        <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hover:text-destructive"
                        onClick={(e) => handleDelete(e, c.id, c.name)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Bar */}
      {total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1 py-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              Showing <strong className="text-foreground">{(page - 1) * pageSize + 1}</strong> to{" "}
              <strong className="text-foreground">{Math.min(page * pageSize, total)}</strong> of{" "}
              <strong className="text-foreground">{total}</strong> contacts
            </span>

            <div className="flex items-center gap-1.5">
              <span>Per page:</span>
              <Select
                value={String(pageSize)}
                onValueChange={(val) => {
                  setPageSize(Number(val));
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-16 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs">
              Page <strong className="text-foreground">{page}</strong> of{" "}
              <strong className="text-foreground">{Math.max(1, Math.ceil(total / pageSize))}</strong>
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={page * pageSize >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modals & Drawers */}
      <ContactDetailDrawer
        contact={selectedContact}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        onContactUpdated={(updated) => {
          setSelectedContact(updated);
          void fetchContacts();
        }}
      />

      <ContactEditorModal
        contact={editingContact}
        open={isEditorOpen}
        onOpenChange={setIsEditorOpen}
        onSaved={() => void fetchContacts()}
      />

      <LeadUploadModal
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        onImportCompleted={() => void fetchContacts()}
      />
    </div>
  );
}
