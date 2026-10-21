"use client";

import { FileText, Loader2,UploadCloud } from "lucide-react";
import React, { useState } from "react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type { CreateContactInput } from "./types";

interface LeadUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportCompleted: () => void;
}

type TargetField = "name" | "email" | "phone" | "company" | "role" | "estimatedValue" | "none";

interface ColumnMapping {
  csvHeader: string;
  targetField: TargetField;
}

export function LeadUploadModal({
  open,
  onOpenChange,
  onImportCompleted,
}: LeadUploadModalProps) {
  const [csvText, setCsvText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [importing, setImporting] = useState(false);

  const parseCsv = (text: string) => {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      toast.error("CSV must contain a header row and at least one data row");
      return;
    }

    const rawHeaders = lines[0]!.split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""));
    const rawRows = lines.slice(1).map((line) =>
      line.split(",").map((cell) => cell.trim().replace(/^["']|["']$/g, ""))
    );

    setHeaders(rawHeaders);
    setRows(rawRows);

    // Auto-detect mappings based on header name
    const initialMappings: ColumnMapping[] = rawHeaders.map((header) => {
      const lower = header.toLowerCase();
      let targetField: TargetField = "none";
      if (lower.includes("name") || lower.includes("lead") || lower.includes("person")) {
        targetField = "name";
      } else if (lower.includes("email") || lower.includes("mail")) {
        targetField = "email";
      } else if (lower.includes("phone") || lower.includes("cell") || lower.includes("mobile")) {
        targetField = "phone";
      } else if (lower.includes("company") || lower.includes("firm") || lower.includes("org")) {
        targetField = "company";
      } else if (lower.includes("role") || lower.includes("title") || lower.includes("job")) {
        targetField = "role";
      } else if (lower.includes("value") || lower.includes("budget") || lower.includes("arr")) {
        targetField = "estimatedValue";
      }
      return { csvHeader: header, targetField };
    });

    setMappings(initialMappings);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      setCsvText(content);
      parseCsv(content);
    };
    reader.readAsText(file);
  };

  const updateMapping = (csvHeader: string, targetField: TargetField) => {
    setMappings((prev) =>
      prev.map((m) => (m.csvHeader === csvHeader ? { ...m, targetField } : m))
    );
  };

  const handleImport = async () => {
    const nameMapping = mappings.find((m) => m.targetField === "name");
    if (!nameMapping) {
      toast.error("Please map at least the 'Name' column");
      return;
    }

    const nameIdx = headers.indexOf(nameMapping.csvHeader);
    const emailIdx = headers.indexOf(mappings.find((m) => m.targetField === "email")?.csvHeader ?? "");
    const phoneIdx = headers.indexOf(mappings.find((m) => m.targetField === "phone")?.csvHeader ?? "");
    const compIdx = headers.indexOf(mappings.find((m) => m.targetField === "company")?.csvHeader ?? "");
    const roleIdx = headers.indexOf(mappings.find((m) => m.targetField === "role")?.csvHeader ?? "");
    const valIdx = headers.indexOf(mappings.find((m) => m.targetField === "estimatedValue")?.csvHeader ?? "");

    const contactsToCreate: CreateContactInput[] = [];
    for (const row of rows) {
      const name = row[nameIdx]?.trim();
      if (!name) continue;
      contactsToCreate.push({
        name,
        email: emailIdx >= 0 && row[emailIdx] ? row[emailIdx]!.trim() : null,
        phone: phoneIdx >= 0 && row[phoneIdx] ? row[phoneIdx]!.trim() : null,
        company: compIdx >= 0 && row[compIdx] ? row[compIdx]!.trim() : null,
        role: roleIdx >= 0 && row[roleIdx] ? row[roleIdx]!.trim() : null,
        estimatedValue: valIdx >= 0 && row[valIdx] ? row[valIdx]!.trim() : null,
        status: "new",
        tags: ["csv-import"],
      });
    }

    if (contactsToCreate.length === 0) {
      toast.error("No valid contacts found to import");
      return;
    }

    setImporting(true);
    try {
      const res = await fetch("/api/business/contacts/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: contactsToCreate }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Batch import failed");
      }

      const json = await res.json();
      const count = json.data?.length ?? contactsToCreate.length;
      toast.success(`Successfully imported ${count} contacts`);
      onImportCompleted();
      onOpenChange(false);
      setCsvText("");
      setHeaders([]);
      setRows([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error importing leads");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-primary" />
            Batch Import Leads (CSV)
          </DialogTitle>
          <DialogDescription className="text-xs">
            Upload or paste a CSV file to import and deduplicate leads into your organization directory.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {headers.length === 0 ? (
            <div className="space-y-3">
              <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/40 transition-colors">
                <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <Label htmlFor="csv-file-input" className="cursor-pointer text-xs font-semibold text-primary">
                  Choose CSV file
                </Label>
                <input
                  id="csv-file-input"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <p className="text-[11px] text-muted-foreground mt-1">or paste raw CSV text below</p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Raw CSV Text</Label>
                <Textarea
                  placeholder="name,email,phone,company&#10;Alice Smith,alice@example.com,+15551234567,Acme"
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  rows={4}
                  className="text-xs font-mono"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => parseCsv(csvText)}
                  disabled={!csvText.trim()}
                >
                  Parse & Map Columns
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Parsed <strong>{rows.length}</strong> rows across <strong>{headers.length}</strong> columns</span>
                <Button variant="ghost" size="sm" onClick={() => { setHeaders([]); setRows([]); }} className="h-6 text-xs">
                  Reset
                </Button>
              </div>

              <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                {mappings.map((m) => (
                  <div key={m.csvHeader} className="flex items-center justify-between p-2 text-xs">
                    <span className="font-mono text-[11px] truncate max-w-[180px]">{m.csvHeader}</span>
                    <Select
                      value={m.targetField}
                      onValueChange={(val) => updateMapping(m.csvHeader, val as TargetField)}
                    >
                      <SelectTrigger className="w-36 h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Ignore Column</SelectItem>
                        <SelectItem value="name">Full Name *</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="phone">Phone</SelectItem>
                        <SelectItem value="company">Company</SelectItem>
                        <SelectItem value="role">Role / Title</SelectItem>
                        <SelectItem value="estimatedValue">Est. Value</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={importing}>
            Cancel
          </Button>
          {headers.length > 0 && (
            <Button size="sm" onClick={handleImport} disabled={importing}>
              {importing && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Import {rows.length} Contacts
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
