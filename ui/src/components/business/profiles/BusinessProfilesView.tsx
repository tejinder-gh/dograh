"use client";

import {
  Briefcase,
  Edit2,
  ExternalLink,
  Globe,
  Loader2,
  PhoneCall,
  Plus,
  ShieldCheck,
  Trash2,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import {
  type BusinessProfileData,
  BusinessProfileEditor,
} from "./BusinessProfileEditor";

interface WorkflowItem {
  id: number;
  name: string;
}

export function BusinessProfilesView() {
  const [profiles, setProfiles] = useState<BusinessProfileData[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState<BusinessProfileData | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await fetch("/api/business/profiles");
      if (!res.ok) {
        throw new Error("Failed to load business profiles");
      }
      const json = await res.json();
      setProfiles(json.data || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error loading profiles";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchWorkflows = useCallback(async () => {
    try {
      // In Acuity, workflows can be queried from the backend /api/v1/workflow/fetch or via SDK
      const res = await fetch("/api/v1/workflow/fetch?status=active");
      if (res.ok) {
        const json = await res.json();
        const list = Array.isArray(json) ? json : json.data || [];
        setWorkflows(
          list.map((w: { id: number; name: string }) => ({
            id: w.id,
            name: w.name,
          }))
        );
      }
    } catch {
      // Silent fallback if local workflow list endpoint differs
    }
  }, []);

  useEffect(() => {
    void fetchProfiles();
    void fetchWorkflows();
  }, [fetchProfiles, fetchWorkflows]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete profile "${name}"?`)) return;

    try {
      const res = await fetch(`/api/business/profiles/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete profile");
      toast.success("Business profile deleted");
      setProfiles((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error deleting profile");
    }
  };

  const handleCreateNew = () => {
    setEditingProfile(null);
    setIsEditorOpen(true);
  };

  const handleEdit = (profile: BusinessProfileData) => {
    setEditingProfile(profile);
    setIsEditorOpen(true);
  };

  const handleSaved = (saved: BusinessProfileData) => {
    setProfiles((prev) => {
      const idx = prev.findIndex((p) => p.id === saved.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = saved;
        return updated;
      }
      return [saved, ...prev];
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Business Profiles</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage company domains, operating goals, brand tones, and Acuity voice workflow bindings.
          </p>
        </div>
        <Button onClick={handleCreateNew} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          New Business Profile
        </Button>
      </div>

      {/* Profiles Grid */}
      {loading ? (
        <div className="flex items-center justify-center p-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading business profiles...
        </div>
      ) : profiles.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Briefcase className="h-10 w-10 text-muted-foreground mb-3" />
            <h3 className="text-base font-semibold">No business profiles yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-4">
              Create your organization&apos;s first business profile to link your domain to Acuity voice agents.
            </p>
            <Button onClick={handleCreateNew} size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Create Profile
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {profiles.map((profile) => {
            const linkedWf = workflows.find((w) => w.id === profile.acuityWorkflowId);

            return (
              <Card key={profile.id} className="relative flex flex-col justify-between hover:border-primary/50 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <CardTitle className="text-base font-bold flex items-center gap-2">
                        {profile.name}
                      </CardTitle>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Globe className="h-3.5 w-3.5" />
                        <span>{profile.domain}</span>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs capitalize shrink-0">
                      {profile.industry}
                    </Badge>
                  </div>
                  {profile.description && (
                    <CardDescription className="text-xs line-clamp-2 mt-2">
                      {profile.description}
                    </CardDescription>
                  )}
                </CardHeader>

                <CardContent className="space-y-3 pt-0 text-xs">
                  <div className="rounded-lg bg-muted/40 p-2.5 space-y-1.5 border border-border/60">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1 font-medium">
                        <Workflow className="h-3.5 w-3.5" /> Voice Workflow:
                      </span>
                      {profile.acuityWorkflowId ? (
                        <Link
                          href={`/workflow/${profile.acuityWorkflowId}`}
                          className="font-medium text-primary hover:underline flex items-center gap-1"
                        >
                          {linkedWf?.name || `Workflow #${profile.acuityWorkflowId}`}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground italic">Unassigned</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1 font-medium">
                        <PhoneCall className="h-3.5 w-3.5" /> Inbound Goal:
                      </span>
                      <span className="truncate max-w-[160px] text-right font-medium">
                        {profile.inboundGoal || "Standard Q&A"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1 font-medium">
                        <ShieldCheck className="h-3.5 w-3.5" /> Tone:
                      </span>
                      <span className="truncate max-w-[160px] text-right font-medium">
                        {profile.brandTone}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/40">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(profile)}
                      className="h-8 px-2.5 text-xs gap-1.5"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(profile.id!, profile.name)}
                      className="h-8 px-2.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Editor Modal */}
      <BusinessProfileEditor
        profile={editingProfile}
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        onSaved={handleSaved}
        availableWorkflows={workflows}
      />
    </div>
  );
}
