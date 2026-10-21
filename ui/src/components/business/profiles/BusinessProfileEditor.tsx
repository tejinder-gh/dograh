"use client";

import { Loader2 } from "lucide-react";
import React, { useEffect,useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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

export interface BusinessProfileData {
  id?: string;
  name: string;
  domain: string;
  industry: string;
  description?: string;
  brandTone?: string;
  websiteUrl?: string | null;
  inboundGoal?: string;
  outboundGoal?: string;
  dograhWorkflowId?: number | null;
  isActive?: boolean;
}

interface WorkflowOption {
  id: number;
  name: string;
}

interface BusinessProfileEditorProps {
  profile: BusinessProfileData | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (saved: BusinessProfileData) => void;
  availableWorkflows?: WorkflowOption[];
}

export function BusinessProfileEditor({
  profile,
  isOpen,
  onClose,
  onSaved,
  availableWorkflows = [],
}: BusinessProfileEditorProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<BusinessProfileData>({
    name: "",
    domain: "",
    industry: "general",
    description: "",
    brandTone: "Professional and empathetic",
    websiteUrl: "",
    inboundGoal: "Resolve customer inquiries and qualify needs.",
    outboundGoal: "Assess prospect fit and schedule a consultation.",
    dograhWorkflowId: null,
    isActive: true,
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        id: profile.id,
        name: profile.name || "",
        domain: profile.domain || "",
        industry: profile.industry || "general",
        description: profile.description || "",
        brandTone: profile.brandTone || "Professional and empathetic",
        websiteUrl: profile.websiteUrl || "",
        inboundGoal: profile.inboundGoal || "Resolve customer inquiries and qualify needs.",
        outboundGoal: profile.outboundGoal || "Assess prospect fit and schedule a consultation.",
        dograhWorkflowId: profile.dograhWorkflowId ?? null,
        isActive: profile.isActive ?? true,
      });
    } else {
      setFormData({
        name: "",
        domain: "",
        industry: "general",
        description: "",
        brandTone: "Professional and empathetic",
        websiteUrl: "",
        inboundGoal: "Resolve customer inquiries and qualify needs.",
        outboundGoal: "Assess prospect fit and schedule a consultation.",
        dograhWorkflowId: null,
        isActive: true,
      });
    }
  }, [profile, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.domain.trim()) {
      toast.error("Business name and domain are required");
      return;
    }

    setLoading(true);
    try {
      const isEdit = Boolean(formData.id);
      const url = isEdit
        ? `/api/business/profiles/${formData.id}`
        : "/api/business/profiles";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to save business profile");
      }

      toast.success(isEdit ? "Business profile updated" : "Business profile created");
      onSaved(json.data);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error saving profile";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {formData.id ? "Edit Business Profile" : "Create Business Profile"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Business Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Apex Global Advisors"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="domain">Primary Domain *</Label>
              <Input
                id="domain"
                value={formData.domain}
                onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                placeholder="e.g. apex-advisors.com"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="industry">Industry Category</Label>
              <Input
                id="industry"
                value={formData.industry}
                onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                placeholder="e.g. Financial Services, Healthcare"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="brandTone">Brand Tone</Label>
              <Input
                id="brandTone"
                value={formData.brandTone}
                onChange={(e) => setFormData({ ...formData, brandTone: e.target.value })}
                placeholder="e.g. Consultative, empathetic, authoritative"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Business Overview & Description</Label>
            <Textarea
              id="description"
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief summary of operations, primary products, and target clientele..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="inboundGoal">Inbound Call Objective</Label>
              <Input
                id="inboundGoal"
                value={formData.inboundGoal}
                onChange={(e) => setFormData({ ...formData, inboundGoal: e.target.value })}
                placeholder="e.g. Triage inquiries and schedule discovery sessions"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="outboundGoal">Outbound Call Objective</Label>
              <Input
                id="outboundGoal"
                value={formData.outboundGoal}
                onChange={(e) => setFormData({ ...formData, outboundGoal: e.target.value })}
                placeholder="e.g. Qualify decision-makers and confirm budget"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dograhWorkflowId">Assigned Dograh Voice Workflow</Label>
            <Select
              value={formData.dograhWorkflowId ? String(formData.dograhWorkflowId) : "unassigned"}
              onValueChange={(val) =>
                setFormData({
                  ...formData,
                  dograhWorkflowId: val === "unassigned" ? null : parseInt(val, 10),
                })
              }
            >
              <SelectTrigger id="dograhWorkflowId">
                <SelectValue placeholder="Select a voice agent workflow..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">-- Unassigned (No active workflow) --</SelectItem>
                {availableWorkflows.map((wf) => (
                  <SelectItem key={wf.id} value={String(wf.id)}>
                    {wf.name} (ID: {wf.id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Links this business profile to an existing Dograh conversational workflow graph.
            </p>
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {formData.id ? "Save Changes" : "Create Profile"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
