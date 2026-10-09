'use client';

import React, { useState } from 'react';
import { LeadStatus, PriorityLevel, PropertyNoteDTO, SavedPropertyDTO } from '@/types';
import {
  Bookmark,
  Check,
  MessageSquare,
  Send,
  Flag,
  User,
  Clock,
  Briefcase,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface InvestorWorkflowBarProps {
  propertyId: string;
  savedRecord?: SavedPropertyDTO | null;
  initialNotes?: PropertyNoteDTO[];
  userId: string;
}

export function InvestorWorkflowBar({
  propertyId,
  savedRecord,
  initialNotes = [],
  userId,
}: InvestorWorkflowBarProps) {
  const router = useRouter();
  const [isSaved, setIsSaved] = useState(!!savedRecord);
  const [status, setStatus] = useState<LeadStatus>(savedRecord?.status || 'NEW');
  const [priority, setPriority] = useState<PriorityLevel>(savedRecord?.priority || 'NORMAL');
  const [notes, setNotes] = useState<PropertyNoteDTO[]>(initialNotes);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const handleToggleSave = async () => {
    try {
      const res = await fetch(`/api/properties/${propertyId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, priority }),
      });
      const data = await res.json();
      setIsSaved(data.isSaved);
      router.refresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleStatusChange = async (newStatus: LeadStatus) => {
    setStatus(newStatus);
    setSavingStatus(true);
    try {
      await fetch(`/api/properties/${propertyId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'UPDATE_STATUS', status: newStatus, priority }),
      });
      setIsSaved(true);
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingStatus(false);
    }
  };

  const handlePriorityChange = async (newPriority: PriorityLevel) => {
    setPriority(newPriority);
    try {
      await fetch(`/api/properties/${propertyId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'UPDATE_STATUS', status, priority: newPriority }),
      });
      setIsSaved(true);
      router.refresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteContent.trim() || savingNote) return;

    setSavingNote(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newNoteContent }),
      });
      const data = await res.json();
      if (data.note) {
        setNotes([data.note, ...notes]);
        setNewNoteContent('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingNote(false);
    }
  };

  const statusOptions: { value: LeadStatus; label: string }[] = [
    { value: 'NEW', label: 'New Lead' },
    { value: 'RESEARCHING', label: 'Researching' },
    { value: 'CONTACTING', label: 'Contacting Owner' },
    { value: 'FOLLOW_UP', label: 'Follow Up Scheduled' },
    { value: 'INTERESTED', label: 'Interested / Under Review' },
    { value: 'NOT_INTERESTED', label: 'Not Interested / Pass' },
    { value: 'CLOSED_DEAL', label: 'Closed / Deal Under Contract' },
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-5">
      {/* Workflow Controls Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-amber-400" />
          <div>
            <h3 className="text-sm font-bold text-white">Investor Action & Pipeline Workflow</h3>
            <p className="text-[11px] text-slate-400">Track deal stage, priority, and research logs.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Priority */}
          <select
            value={priority}
            onChange={(e) => handlePriorityChange(e.target.value as PriorityLevel)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-300 focus:outline-none focus:border-amber-500"
          >
            <option value="LOW">Priority: Low</option>
            <option value="NORMAL">Priority: Normal</option>
            <option value="HIGH">Priority: High</option>
            <option value="URGENT">Priority: Urgent</option>
          </select>

          {/* Lead Status */}
          <select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-bold text-amber-400 focus:outline-none focus:border-amber-500"
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Stage: {opt.label}
              </option>
            ))}
          </select>

          {/* Save toggle */}
          <button
            onClick={handleToggleSave}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold border transition ${
              isSaved
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
            }`}
          >
            {isSaved ? (
              <>
                <Check className="w-4 h-4 text-amber-400" />
                <span>Saved to Pipeline</span>
              </>
            ) : (
              <>
                <Bookmark className="w-4 h-4" />
                <span>Save Property</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Notes Section */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
          <span>Investor Notes & Outreach Log ({notes.length})</span>
        </h4>

        {/* Add Note Form */}
        <form onSubmit={handleAddNote} className="flex gap-2">
          <input
            type="text"
            value={newNoteContent}
            onChange={(e) => setNewNoteContent(e.target.value)}
            placeholder="Add research note, owner contact attempt, or title verification note..."
            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
          <button
            type="submit"
            disabled={savingNote || !newNoteContent.trim()}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Add Note</span>
          </button>
        </form>

        {/* Existing Notes Feed */}
        {notes.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-2">No notes added for this lead yet.</p>
        ) : (
          <div className="space-y-2 pt-1">
            {notes.map((note) => {
              const timeStr = new Date(note.createdAt).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={note.id}
                  className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-semibold text-amber-400/90 flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" />
                      {note.authorName || 'Investor'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {timeStr}
                    </span>
                  </div>
                  <p className="text-slate-200 leading-relaxed">{note.content}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
