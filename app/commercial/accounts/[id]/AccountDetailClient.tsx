'use client';

import { useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckSquare, Building2, MapPin, Globe, Save, Trash2, Edit, X, Calendar, ExternalLink, ChevronDown, ChevronUp, FileText, Sparkles, Loader2, TrendingUp, Plus, Search, User, Users, Network, Clock, CalendarCheck, CalendarOff, ClipboardList, Briefcase, DollarSign } from 'lucide-react';
import ActivityTimeline from '@/app/components/commercial/ActivityTimeline';
import { updateAccount } from '@/app/actions/commercial/company';
import { archiveAccountWithCascade, restoreAccount } from '@/app/actions/commercial/archive';
import { createNote, updateNote, deleteNote } from '@/app/actions/commercial/note';
import { generateAccountHistoryBrief } from '@/app/actions/commercial/history';
import { updateContact } from '@/app/actions/commercial/contact';
import RichTextEditor from '@/app/components/ui/RichTextEditor';
import { getUsers } from '@/app/actions/users';
import { getAccounts } from '@/app/actions/commercial/company';
import { useEffect } from 'react';
import DeleteReasonModal from '@/app/components/modals/DeleteReasonModal';
import ConfirmModal from '@/app/components/modals/ConfirmModal';
import ArchivedBanner from '@/app/components/commercial/ArchivedBanner';
import PreviouslyArchivedNote from '@/app/components/commercial/PreviouslyArchivedNote';
import { clsx } from "clsx";
import SystemLogTimeline from '@/app/components/SystemLogTimeline';
import SuccessToast from '@/app/components/SuccessToast';
import CollapsibleComment from '@/app/components/ui/CollapsibleComment';
import RelationshipMapCanvas from './RelationshipMapCanvas';
import FileDropzone from '@/app/components/FileDropzone';
import { useEditLock, type OtherEditor } from '@/app/lib/useEditLock';
import EditLockModal from '@/app/components/EditLockModal';
import { communicationStatusStyle } from '@/app/lib/communicationStatus';
interface AttachedFile {
    url: string;
    name: string;
    date?: string;
}

function parseAttachedFiles(dbValue: string | null | undefined, defaultName: string): AttachedFile[] {
    if (!dbValue) return [];
    const trimmed = dbValue.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
            return JSON.parse(trimmed);
        } catch (e) {
            // fallback
        }
    }
    return [{ url: trimmed, name: defaultName }];
}



// Assuming simplified types for props based on data passed from page.tsx
interface AccountDetailClientProps {
    account: any; // Using any for simplicity as per existing pattern or refine if types available
}

export default function AccountDetailClient({ account }: AccountDetailClientProps) {
    const router = useRouter();

    // Extended States for Parity with Leads
    const [activeTab, setActiveTab] = useState<string>('account');
    const [isDescExpanded, setIsDescExpanded] = useState(false);
    const [expandedNotes, setExpandedNotes] = useState<Record<number, boolean>>({});
    const [contactSearchQuery, setContactSearchQuery] = useState("");
    const [isUpdatingRelation, setIsUpdatingRelation] = useState(false);

    // Local state for optimistic updates
    const [localContacts, setLocalContacts] = useState<any[]>(account.contacts || []);
    const [localRelationships, setLocalRelationships] = useState<any[]>(account.relationships || []);

    useEffect(() => {
        setLocalContacts(account.contacts || []);
    }, [account.contacts]);

    useEffect(() => {
        setLocalRelationships(account.relationships || []);
    }, [account.relationships]);

    async function handleSetReportsTo(contactId: number, managerId: number | null) {
        setIsUpdatingRelation(true);
        const prevContacts = [...localContacts];
        setLocalContacts(prev => prev.map(c => c.id === contactId ? { ...c, reportsToId: managerId } : c));

        const res = await updateContact(contactId, { reportsToId: managerId ? String(managerId) : "" });
        if (!res.success) {
            setLocalContacts(prevContacts); // revert
            setNotifyModal({
                open: true,
                title: "Error updating hierarchy",
                description: res.error || "Failed to update relationship.",
                variant: "danger"
            });
        }
        setIsUpdatingRelation(false);
    }

    const [isGeneratingAi, setIsGeneratingAi] = useState(false);
    const [aiSummaryVersion, setAiSummaryVersion] = useState(1);
    const [isSavingDueDate, setIsSavingDueDate] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [notifyModal, setNotifyModal] = useState<{ open: boolean; title: string; description: string; variant: 'danger' | 'success' | 'info' }>({ open: false, title: '', description: '', variant: 'info' });
    const [users, setUsers] = useState<any[]>([]);
    const [parentAccounts, setParentAccounts] = useState<any[]>([]);

    useEffect(() => {
        getUsers().then(res => {
            if (res.success && res.data) setUsers(res.data);
        });
        getAccounts().then(res => {
            if (res.success && res.data) {
                // Filter out current account to avoid circular reference in parent selection
                setParentAccounts(res.data.filter((a: any) => a.id !== account.id));
            }
        });
    }, [account.id]);

    // Edit Mode State
    const [isEditing, setIsEditing] = useState(false);
    // Advisory concurrent-edit warning state (lock wiring is set up further down,
    // after the note sub-editor states it depends on are declared).
    const [lockEditors, setLockEditors] = useState<OtherEditor[] | null>(null);
    const [pendingEditOpen, setPendingEditOpen] = useState<(() => void) | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isDealsExpanded, setIsDealsExpanded] = useState(false);
    const [jobStatusFilter, setJobStatusFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('OPEN');
    const [assignmentStatusFilter, setAssignmentStatusFilter] = useState<'ALL' | 'ACTIVE' | 'FINISHED'>('ACTIVE');
    const [isJobsExpanded, setIsJobsExpanded] = useState(false);
    const [isAssignmentsExpanded, setIsAssignmentsExpanded] = useState(false);
    const [oppStatusFilter, setOppStatusFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('OPEN');
    const [isOppsExpanded, setIsOppsExpanded] = useState(false);
    const [isKdmExpanded, setIsKdmExpanded] = useState(false);
    const [isOtherContactsExpanded, setIsOtherContactsExpanded] = useState(false);

    const [saveError, setSaveError] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        name: account.name || "",
        ownerId: account.ownerId || "",
        parentAccountId: account.parentAccountId || "",
        phone: account.phone || "",
        outsourcing: account.outsourcing || "N/A",
        nextFu: account.nextFu ? new Date(account.nextFu).toISOString().slice(0, 16) : "",
        type: account.type || "",
        source: account.source || "",
        industry: account.industry || "",
        technologies: account.technologies || "",
        numberOfEmployees: account.numberOfEmployees || "",
        website: account.website || "",

        // Billing
        billingStreet: account.billingStreet || "",
        billingCity: account.billingCity || "",
        billingState: account.billingState || "",
        billingPostalCode: account.billingPostalCode || "",
        billingCountry: account.billingCountry || "",

        description: account.description || "",
        companyDetails: account.companyDetails || "",
        annualRevenue: account.annualRevenue || "",

        // Document fields
        ndaUrl: account.ndaUrl || "",
        ndaDate: account.ndaDate ? new Date(account.ndaDate).toISOString() : "",
        msaUrl: account.msaUrl || "",
        msaDate: account.msaDate ? new Date(account.msaDate).toISOString() : "",
        otherUrl: account.otherUrl || "",
        otherDate: account.otherDate ? new Date(account.otherDate).toISOString() : "",
        dueDateTimezone: account.dueDateTimezone || "GMT-3",
        nextFuCompleted: account.nextFuCompleted || false,
    });

    const handleRescheduleFocus = () => {
        const input = document.getElementById('fu-date-input');
        if (input) {
            input.scrollIntoView({ behavior: 'smooth', block: 'center' });
            (input as HTMLInputElement).focus();
            if (typeof (input as any).showPicker === 'function') {
                try {
                    (input as any).showPicker();
                } catch (e) {}
            }
        }
    };

    const formatFollowUpDate = (dateStr: string, tz: string) => {
        if (!dateStr) return "";
        try {
            const parts = dateStr.split('T');
            if (parts.length < 2) return dateStr;
            const [datePart, timePart] = parts;
            const [year, month, day] = datePart.split('-').map(Number);
            const [hour, minute] = timePart.split(':').map(Number);
            
            const date = new Date(year, month - 1, day, hour, minute);
            
            const options: Intl.DateTimeFormatOptions = {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            };
            
            const formatted = date.toLocaleDateString('en-US', options);
            return `${formatted} (${tz || 'GMT-3'})`;
        } catch (e) {
            return `${dateStr} (${tz || 'GMT-3'})`;
        }
    };

    // Document Upload and Removal States
    const [ndaUploading, setNdaUploading] = useState(false);
    const [msaUploading, setMsaUploading] = useState(false);
    const [otherUploading, setOtherUploading] = useState(false);

    const [showNdaRemoveConfirm, setShowNdaRemoveConfirm] = useState(false);
    const [showMsaRemoveConfirm, setShowMsaRemoveConfirm] = useState(false);
    const [showOtherRemoveConfirm, setShowOtherRemoveConfirm] = useState(false);

    const [ndaDeleteIndex, setNdaDeleteIndex] = useState<number | null>(null);
    const [msaDeleteIndex, setMsaDeleteIndex] = useState<number | null>(null);
    const [otherDeleteIndex, setOtherDeleteIndex] = useState<number | null>(null);

    const handleDocumentUpload = async (file: File, type: 'nda' | 'msa' | 'other') => {
        const setUploading = type === 'nda' ? setNdaUploading : type === 'msa' ? setMsaUploading : setOtherUploading;
        setUploading(true);
        const data = new FormData();
        data.append('file', file);
        try {
            const res = await fetch('/api/opportunities/upload-doc', { method: 'POST', body: data });
            const result = await res.json();
            if (result.url) {
                const defaultName = type === 'nda' ? 'NDA Document' : type === 'msa' ? 'MSA Document' : 'Other Document';
                const currentFiles = parseAttachedFiles(formData[`${type}Url`], defaultName);
                const newFile = { url: result.url, name: result.name || file.name, date: new Date().toISOString() };
                const updatedFiles = [...currentFiles, newFile];
                const newUrlStr = JSON.stringify(updatedFiles);
                const newDate = new Date().toISOString();
                
                const updatedFormData = {
                    ...formData,
                    [`${type}Url`]: newUrlStr,
                    [`${type}Date`]: newDate
                };

                setFormData(updatedFormData);

                const saveRes = await updateAccount(account.id, updatedFormData);
                if (saveRes.success) {
                    router.refresh();
                } else {
                    console.error("Failed to save account document immediately:", saveRes.error);
                }
            }
        } catch (error) {
            console.error(`Error uploading ${type} document:`, error);
        }
        setUploading(false);
    };

    function getViewableUrl(url: string): string {
        return url || '';
    }

    function handleDocClick(e: React.MouseEvent<HTMLAnchorElement>, url: string) {
        // No-op — let default <a href target=_blank> handle it
    }

    // Notes State
    const [notes, setNotes] = useState(account.notes || []);
    const [isAddingNote, setIsAddingNote] = useState(false);
    const [newNote, setNewNote] = useState('');

    // AI History Brief — generated from the account's + its contacts' real notes.
    const [briefPeriods, setBriefPeriods] = useState<{ label: string; summary: string }[]>([]);
    const [briefLoading, setBriefLoading] = useState(false);
    const [briefLoaded, setBriefLoaded] = useState(false);

    // `force` bypasses the server-side brief cache — the Refresh button passes it so
    // the user always gets a freshly generated brief, not the stored one.
    const loadHistoryBrief = async (force = false) => {
        if (briefLoading) return;
        setBriefLoading(true);
        try {
            const res = await generateAccountHistoryBrief(account.id, force);
            setBriefPeriods(res?.periods || []);
        } catch {
            setBriefPeriods([]);
        } finally {
            setBriefLoading(false);
            setBriefLoaded(true);
        }
    };

    useEffect(() => {
        loadHistoryBrief();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [account.id]);
    const [isSubmittingNote, setIsSubmittingNote] = useState(false);
    const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
    const [editNoteContent, setEditNoteContent] = useState('');
    const [confirmDeleteNote, setConfirmDeleteNote] = useState<number | null>(null);

    // ── Concurrent-edit presence for the whole record ──
    // Active while the account edit OR any note sub-editor (add / edit) is open.
    const isEditingAnything = isEditing || isAddingNote || editingNoteId !== null;
    const { acquire: acquireEditLock, release: releaseEditLock } = useEditLock('account', account.id, isEditingAnything);
    const guardEdit = async (open: () => void) => {
        const others = await acquireEditLock();
        if (others.length > 0) { setPendingEditOpen(() => open); setLockEditors(others); }
        else open();
    };
    const requestEdit = () => guardEdit(() => setIsEditing(true));

    // Follow Up — always inline-editable (no isEditing gating, mirrors LeadDetailClient)
    const [isSavingFu, setIsSavingFu] = useState(false);

    async function handleAddNote() {
        if (!newNote.replace(/<[^>]*>/g, '').trim()) return;
        setIsSubmittingNote(true);
        const res = await createNote({ content: newNote, companyId: account.id });
        if (res.success && res.data) {
            setNotes([res.data, ...notes]);
            setNewNote('');
            setIsAddingNote(false);
            router.refresh();
        } else {
            setNotifyModal({ open: true, title: 'Error', description: `Failed to add note: ${res.error || 'Unknown error'}`, variant: 'danger' });
        }
        setIsSubmittingNote(false);
    }

    async function handleUpdateNote(id: number) {
        if (!editNoteContent.replace(/<[^>]*>/g, '').trim()) return;
        const res = await updateNote({ id, content: editNoteContent, companyId: account.id });
        if (res.success && res.data) {
            setNotes(notes.map((n: any) => n.id === id ? { ...n, content: res.data.content, updatedAt: res.data.updatedAt } : n));
            setEditingNoteId(null);
            setEditNoteContent('');
        } else {
            setNotifyModal({ open: true, title: 'Error', description: `Failed to update comment: ${res.error || 'Unknown error'}`, variant: 'danger' });
        }
    }

    async function handleDeleteNote(id: number) {
        const res = await deleteNote({ id, companyId: account.id });
        if (res.success) {
            setNotes(notes.filter((n: any) => n.id !== id));
        } else {
            setNotifyModal({ open: true, title: 'Error', description: `Failed to delete comment: ${res.error || 'Unknown error'}`, variant: 'danger' });
        }
    }

    async function handleSaveAccount() {
        setIsSaving(true);
        setSaveError(null);
        // Prepare data (convert types if needed, e.g. int)
        const payload = {
            ...formData,
            numberOfEmployees: formData.numberOfEmployees ? parseInt(String(formData.numberOfEmployees)) : null,
            parentAccountId: formData.parentAccountId ? parseInt(String(formData.parentAccountId)) : null,
            nextFu: formData.nextFu ? new Date(formData.nextFu) : null,
            annualRevenue: formData.annualRevenue ? parseFloat(String(formData.annualRevenue)) : null,
        };

        const res = await updateAccount(account.id, payload);
        if (res.success) {
            setIsEditing(false);
            router.refresh();
        } else {
            setSaveError(res.error || "Failed to save changes. Please try again.");
        }
        setIsSaving(false);
    }

    function handleCancelEdit() {
        setFormData({
            name: account.name || "",
            ownerId: account.ownerId || "",
            parentAccountId: account.parentAccountId || "",
            phone: account.phone || "",
            outsourcing: account.outsourcing || "N/A",
            nextFu: account.nextFu ? new Date(account.nextFu).toISOString().slice(0, 16) : "",
            type: account.type || "",
            source: account.source || "",
            industry: account.industry || "",
            technologies: account.technologies || "",
            numberOfEmployees: account.numberOfEmployees || "",
            website: account.website || "",

            billingStreet: account.billingStreet || "",
            billingCity: account.billingCity || "",
            billingState: account.billingState || "",
            billingPostalCode: account.billingPostalCode || "",
            billingCountry: account.billingCountry || "",

            description: account.description || "",
            companyDetails: account.companyDetails || "",
            annualRevenue: account.annualRevenue || "",

            // Document fields
            ndaUrl: account.ndaUrl || "",
            ndaDate: account.ndaDate ? new Date(account.ndaDate).toISOString() : "",
            msaUrl: account.msaUrl || "",
            msaDate: account.msaDate ? new Date(account.msaDate).toISOString() : "",
            otherUrl: account.otherUrl || "",
            otherDate: account.otherDate ? new Date(account.otherDate).toISOString() : "",
            dueDateTimezone: account.dueDateTimezone || "GMT-3",
            nextFuCompleted: account.nextFuCompleted || false,
        });
        setIsEditing(false);
    }

    const handleDelete = async (reason: string) => {
        setIsDeleting(true);
        const res = await archiveAccountWithCascade(account.id, reason);
        if (res.success) {
            router.push('/commercial/accounts');
            router.refresh();
        } else {
            setIsDeleting(false);
        }
    };

    const handleRestore = async () => {
        const res = await restoreAccount(account.id);
        if (res.success) {
            router.refresh();
        }
    };

    // Derive assigned candidates from opportunities
    const assignedCandidates = (account.opportunities || []).flatMap((opp: any) =>
        (opp.candidates || []).filter((dc: any) => dc.candidate).map((dc: any) => ({
            id: dc.candidate.id,
            fullName: dc.candidate.fullName,
            opportunityTitle: opp.title,
        }))
    );
    const uniqueCandidates = assignedCandidates.filter((c: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.id === c.id) === i);

    // Deals (opportunities) limit
    const opportunities = account.opportunities || [];



    // Shared input classes
    const inputCls = "w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:border-blue-500 outline-none transition-all font-medium text-sm";
    const selectCls = `${inputCls} cursor-pointer appearance-none`;
    const textareaCls = `${inputCls} resize-none`;

    
    // Real-time Dynamic AI Resume Generator (mirrored from LeadDetailClient)
    const getAiResume = () => {
        const activeOpps = opportunities.filter((o: any) => o.status !== 'Closed Won' && o.status !== 'Closed Lost');
        const wonOpps = opportunities.filter((o: any) => o.status === 'Closed Won');
        const lostOpps = opportunities.filter((o: any) => o.status === 'Closed Lost');
        const latestComment = notes[0];

        let summaryText = `**${account.name}** is currently classified as a **${account.type || 'Standard'}** account in the **${account.industry || 'Technology / Software'}** sector. `;

        if (activeOpps.length > 0) {
            const topOpp = activeOpps[0];
            const formattedValue = topOpp.value ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(topOpp.value) : 'undisclosed value';
            summaryText += `There is high commercial momentum with **${activeOpps.length} active opportunities** in progress. Most notably, **"${topOpp.name}"** is in the **${topOpp.stage || 'Negotiation'}** stage with a pipeline value of **${formattedValue}**, representing a high-potential deal. `;
        } else {
            summaryText += "There are currently no active deals in the sales pipeline. ";
        }

        if (wonOpps.length > 0) {
            const topWon = wonOpps[0];
            const totalWonValue = wonOpps.reduce((sum: number, o: any) => sum + (o.value || 0), 0);
            const formattedTotal = totalWonValue > 0 ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(totalWonValue) : '';
            summaryText += `The relationship has a strong foundation of success, with **${wonOpps.length} closed-won deals**${formattedTotal ? ` totaling **${formattedTotal}**` : ''}, including the **"${topWon.name}"** opportunity. `;
        }

        if (latestComment) {
            const cleanText = latestComment.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            const author = latestComment.author?.name || 'System';
            const date = new Date(latestComment.createdAt).toLocaleDateString();
            
            const cleanLower = cleanText.toLowerCase();
            let actions: string[] = [];
            
            if (cleanLower.includes('fu') || cleanLower.includes('follow up') || cleanLower.includes('follow-up')) {
                actions.push('conducting a commercial follow-up');
            }
            if (cleanLower.includes('rate') || cleanLower.includes('pricing') || cleanLower.includes('fee')) {
                actions.push('adjusting staffing rates to be more competitive');
            }
            if (cleanLower.includes('contact') || cleanLower.includes('meeting') || cleanLower.includes('call')) {
                actions.push('aligning with key stakeholders');
            }
            if (cleanLower.includes('candidate') || cleanLower.includes('profile') || cleanLower.includes('cv') || cleanLower.includes('recruit')) {
                actions.push('evaluating strategic consultant profiles');
            }
            if (cleanLower.includes('onboard') || cleanLower.includes('start')) {
                actions.push('coordinating technical onboarding procedures');
            }
            if (cleanLower.includes('contract') || cleanLower.includes('nda') || cleanLower.includes('msa') || cleanLower.includes('agreement')) {
                actions.push('reviewing master service agreements and contract status');
            }
            
            let commentSummary = "";
            if (actions.length > 0) {
                if (actions.length === 1) {
                    commentSummary = `The latest account update (logged on ${date} by ${author}) indicates focus is currently on ${actions[0]}.`;
                } else if (actions.length === 2) {
                    commentSummary = `The latest update on ${date} by ${author} covers ${actions[0]} and ${actions[1]}.`;
                } else {
                    commentSummary = `On ${date}, ${author} logged an update covering ${actions[0]}, ${actions[1]}, as well as ${actions[2]}.`;
                }
            } else {
                let trimmedText = cleanText.replace(/[\s\.\…]+$/, '').trim();
                const sentenceEnd = trimmedText.search(/[\.\!\?]/);
                if (sentenceEnd > 15 && sentenceEnd < 120) {
                    trimmedText = trimmedText.substring(0, sentenceEnd + 1);
                } else {
                    if (trimmedText.length > 100) {
                        let truncated = trimmedText.substring(0, 100);
                        const lastSpace = truncated.lastIndexOf(' ');
                        if (lastSpace > 50) {
                            truncated = truncated.substring(0, lastSpace);
                        }
                        trimmedText = truncated + " and related operational details";
                    }
                    if (!trimmedText.endsWith('.')) {
                        trimmedText += ".";
                    }
                }
                commentSummary = `The latest update on ${date} by ${author} notes that: ${trimmedText}`;
            }
            
            summaryText += commentSummary;
        } else {
            summaryText += "No general comments or meeting minutes have been recorded recently.";
        }

        // Actionable Recommendations
        const recommendations = [];
        if (!formData.nextFu) {
            recommendations.push({
                icon: "⚠️",
                title: "Next touch missing",
                desc: "This account has no upcoming follow-up planned. It is highly recommended to schedule a follow-up touchpoint."
            });
        } else {
            recommendations.push({
                icon: "📅",
                title: "Upcoming touchpoint",
                desc: `A follow-up is scheduled for ${new Date(formData.nextFu).toLocaleDateString()}. Ensure discussion agendas are prepared.`
            });
        }

        if (lostOpps.length > 0) {
            const topLost = lostOpps[0];
            recommendations.push({
                icon: "💡",
                title: "Re-engagement opportunity",
                desc: `Previous deal "${topLost.name}" was marked as Closed Lost. Review historical friction points for future campaigns.`
            });
        }

        if (activeOpps.length > 0) {
            recommendations.push({
                icon: "🚀",
                title: "Deal acceleration",
                desc: "Focus on driving active pipeline opportunities to the next stage by verifying decision-makers and next steps."
            });
        }

        return { summaryText, recommendations };
    };

    const handleRegenerateAi = () => {
        setIsGeneratingAi(true);
        setTimeout(() => {
            setIsGeneratingAi(false);
            setAiSummaryVersion(v => v + 1);
        }, 1000);
    };

    const { summaryText, recommendations } = getAiResume();

    const aiResumeWidget = (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden relative">
            <div className="h-1 bg-gradient-to-r from-sky-400 to-blue-500" />
            
            <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-blue-50 text-blue-500 rounded-lg animate-pulse">
                            <Sparkles size={14} />
                        </div>
                        <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest" style={{ fontFamily: 'var(--font-lato)' }}>Account AI Resume</span>
                    </div>
                </div>

                {isGeneratingAi ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-3">
                        <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest animate-pulse" style={{ fontFamily: 'var(--font-lato)' }}>Synthesizing Account Data...</span>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="text-xs text-gray-600 leading-relaxed font-medium" style={{ fontFamily: 'var(--font-lato)' }}>
                            {summaryText.split('**').map((chunk, i) => {
                                if (i % 2 === 1) {
                                    return <strong key={i} className="font-bold text-gray-900">{chunk}</strong>;
                                }
                                if (chunk.startsWith(' *') || chunk.startsWith('*') || chunk.includes('*"')) {
                                    return <em key={i} className="italic text-gray-800">{chunk.replace(/\*/g, '')}</em>;
                                }
                                return chunk;
                            })}
                        </div>

                        <div className="h-px bg-gray-50" />

                        <div>
                            <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest block mb-3" style={{ fontFamily: 'var(--font-lato)' }}>AI Strategic Insights</span>
                            <div className="space-y-3">
                                {recommendations.map((rec, i) => (
                                    <div key={i} className="flex items-start gap-2.5">
                                        <span className="text-sm select-none mt-0.5">{rec.icon}</span>
                                        <div className="min-w-0 flex-1">
                                            <h5 className="text-[10px] font-bold text-gray-800 uppercase tracking-wider leading-none" style={{ fontFamily: 'var(--font-lato)' }}>{rec.title}</h5>
                                            <p className="text-[11px] text-gray-500 mt-1 leading-normal" style={{ fontFamily: 'var(--font-lato)' }}>{rec.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="pt-2 text-[9px] text-gray-400 font-bold uppercase tracking-widest border-t border-gray-50 flex items-center justify-between" style={{ fontFamily: 'var(--font-lato)' }}>
                            <span>AI Engine v2.4</span>
                            <span>Refreshed Real-Time</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    // Hide entirely when there is nothing to summarize (no notes / empty brief).
    const historyBriefSection = (briefLoaded && !briefLoading && briefPeriods.length === 0) ? null : (
        <div className="bg-gradient-to-br from-indigo-50/50 to-purple-50/30 rounded-lg border border-indigo-100/80 overflow-hidden mb-6">
            <div className="px-6 pt-5 pb-5">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Sparkles className={clsx("h-4 w-4 text-indigo-500", briefLoading && "animate-pulse")} />
                        <span className="text-xs font-black text-indigo-600 uppercase tracking-widest" style={{ fontFamily: 'var(--font-lato)' }}>AI History Brief</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-indigo-100/50 flex items-center gap-1">
                            <Sparkles size={10} /> Auto-generated
                        </span>
                        {!briefLoading && (
                            <button
                                type="button"
                                onClick={() => loadHistoryBrief(true)}
                                className="text-[10px] font-bold text-indigo-400 hover:text-indigo-600 uppercase tracking-wider"
                                title="Regenerate from latest notes"
                            >
                                ↻ Refresh
                            </button>
                        )}
                    </div>
                </div>

                <p className="text-xs text-gray-500 mb-4 leading-relaxed font-semibold">
                    Here is a chronological executive summary of all comments and notes logged for this account:
                </p>

                {briefLoading ? (
                    <div className="space-y-3 animate-pulse">
                        <div className="h-3 w-1/3 bg-indigo-100 rounded" />
                        <div className="h-3 w-5/6 bg-indigo-50 rounded" />
                        <div className="h-3 w-2/3 bg-indigo-50 rounded" />
                    </div>
                ) : (
                    <div className="relative pl-6 border-l border-indigo-100 space-y-4">
                        {briefPeriods.map((period, i) => (
                            <div className="relative" key={i}>
                                <div className="absolute -left-[29px] top-1 w-2 h-2 rounded-full bg-indigo-400 border border-white"></div>
                                {period.label && (
                                    <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{period.label}</span>
                                )}
                                <p className="text-xs text-gray-600 mt-1 font-medium leading-relaxed" style={{ fontFamily: 'var(--font-lato)' }}>{period.summary}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className="flex-1 overflow-auto bg-gray-50/50 min-h-screen">
            <Suspense><SuccessToast messages={{ converted: "Lead converted to Account successfully!" }} /></Suspense>
            <div className="mx-auto px-4 py-4 transition-all max-w-[1280px]">

                {/* Archived banner */}
                {account.isArchived && (
                    <ArchivedBanner
                        reason={account.archiveReason}
                        archivedAt={account.archivedAt}
                        archivedBy={account.archivedBy}
                        onRestore={handleRestore}
                    />
                )}

                {/* Subtle note if previously archived (after restore) */}
                {!account.isArchived && (
                    <PreviouslyArchivedNote archiveReason={account.archiveReason} />
                )}

                {/* Redesigned Integrated White Header and Navigation */}
                <div className="bg-white border-b border-gray-200 -mx-4 -mt-4 px-6 pt-5 pb-0 mb-6">
                    {/* Back Link */}
                    <div className="mb-3 font-semibold">
                        <Link
                            href="/commercial/accounts"
                            className="inline-flex items-center text-xs text-gray-400 hover:text-gray-500 transition-colors"
                        >
                            ← Accounts
                        </Link>
                    </div>

                    {isEditing && saveError && (
                        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{saveError}</div>
                    )}

                    {/* Main Header Content */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 gap-4">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-bold border border-blue-100 uppercase">
                                {(account.name || 'A').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-gray-800 tracking-tight" style={{ fontFamily: 'var(--font-montserrat)' }}>
                                    {account.name}
                                </h1>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-500 font-medium">
                                    {account.type && (
                                        <span>
                                            {account.type === 'PROSPECT' ? 'Prospect' : account.type === 'CUSTOMER' ? 'Customer' : account.type === 'FORMER_CUSTOMER' ? 'Former Customer' : account.type === 'BLACKLISTED' ? 'Blacklisted' : account.type}
                                        </span>
                                    )}
                                    {account.type && account.industry && <span className="text-gray-300">•</span>}
                                    {account.industry && (
                                        <span>{account.industry}</span>
                                    )}
                                    {((account.type && account.owner?.name) || (account.industry && account.owner?.name)) && <span className="text-gray-300">•</span>}
                                    {account.owner?.name && (
                                        <span>Owner: {account.owner.name}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                            {isEditing ? (
                                <>
                                    <button
                                        onClick={handleCancelEdit}
                                        disabled={isSaving}
                                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 transition-all"
                                        style={{ fontFamily: 'var(--font-lato)' }}
                                    >
                                        <X size={14} /> Cancel
                                    </button>
                                    <button
                                        onClick={handleSaveAccount}
                                        disabled={isSaving}
                                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-all disabled:opacity-50"
                                        style={{ fontFamily: 'var(--font-lato)' }}
                                    >
                                        <Save size={14} /> {isSaving ? 'Saving...' : 'Save'}
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={requestEdit}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-all"
                                    style={{ fontFamily: 'var(--font-lato)' }}
                                >
                                    <Edit size={14} /> Edit Profile
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Simple Left-Aligned Text Tabs */}
                    <div className="flex gap-8 border-t border-gray-200 mt-2">
                        {[
                            { id: 'account', label: 'Account & Details' },
                            { id: 'contacts', label: 'Contacts' },
                            { id: 'deals', label: 'Deals & Job Orders' },
                            { id: 'followup', label: 'Follow-up' },
                            { id: 'activity', label: 'Activity & History' },
                            { id: 'docs', label: 'Documents' },
                        ].map((tab) => {
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    className={clsx(
                                        "py-3.5 text-xs font-bold transition-all relative border-b-2 -mb-[2px]",
                                        isActive
                                            ? "text-blue-600 border-blue-600 font-bold"
                                            : "text-gray-500 hover:text-gray-900 border-transparent hover:border-gray-200"
                                    )}
                                >
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Main Grid Layout mirrored from LeadDetailClient */}
                <div className={clsx(
                    "mt-6 font-sans grid grid-cols-1 gap-6 items-start",
                    ['activity', 'contacts'].includes(activeTab) ? "grid-cols-1" : "lg:grid-cols-[1fr_340px]"
                )}>
                    <div className={clsx(
                        "space-y-6 col-start-1",
                        ['activity', 'contacts'].includes(activeTab) ? "col-end-2 lg:col-span-full" : "col-end-2"
                    )}>

                        {activeTab === 'account' && (
                            <div className="space-y-6">
                                 {/* Main Info Card */}
                                <div className="bg-white rounded-lg border border-gray-200 p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Building2 className="h-3.5 w-3.5 text-blue-500" />
                            <span className="text-xs font-black text-blue-500 uppercase tracking-widest" style={{ fontFamily: 'var(--font-lato)' }}>Main Info</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
                            <div>
                                <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Account Owner</dt>
                                <dd className="text-sm text-gray-900 flex items-center gap-1.5">
                                    {isEditing ? (
                                        <select value={formData.ownerId} onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })} className={selectCls}>
                                            <option value="">-- Select --</option>
                                            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                                        </select>
                                    ) : (
                                        account.owner?.name || 'Not provided'
                                    )}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Account Name</dt>
                                <dd className="text-sm text-gray-900">
                                    {isEditing ? <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={inputCls} /> : account.name || 'Not provided'}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Parent Account</dt>
                                <dd className="text-sm text-gray-900">
                                    {isEditing ? (
                                        <select value={formData.parentAccountId} onChange={(e) => setFormData({ ...formData, parentAccountId: e.target.value })} className={selectCls}>
                                            <option value="">--Select--</option>
                                            {parentAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                                        </select>
                                    ) : account.parentAccount ? <Link href={`/commercial/accounts/${account.parentAccount.id}`} className="text-blue-500 hover:underline">{account.parentAccount.name}</Link> : '-'}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Outsourcing</dt>
                                <dd className="text-sm text-gray-900">
                                    {isEditing ? (
                                        <select value={formData.outsourcing} onChange={(e) => setFormData({ ...formData, outsourcing: e.target.value })} className={selectCls}>
                                            <option value="N/A">N/A</option><option value="Yes">Yes</option><option value="No">No</option>
                                        </select>
                                    ) : account.outsourcing || 'Not provided'}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Type</dt>
                                <dd className="text-sm text-gray-900">
                                    {isEditing ? (
                                        <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} className={selectCls}>
                                            <option value="">--Select--</option>
                                            <option value="PROSPECT">Prospect Company</option>
                                            <option value="CUSTOMER">Customer</option>
                                            <option value="FORMER_CUSTOMER">Former Customer</option>
                                            <option value="BLACKLISTED">Blacklisted</option>
                                        </select>
                                    ) : (
                                        formData.type === 'PROSPECT' ? 'Prospect Company' :
                                        formData.type === 'CUSTOMER' ? 'Customer' :
                                        formData.type === 'FORMER_CUSTOMER' ? 'Former Customer' :
                                        formData.type === 'BLACKLISTED' ? 'Blacklisted' :
                                        account.type || 'Not provided'
                                    )}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Account Source</dt>
                                <dd className="text-sm text-gray-900">
                                    {isEditing ? (
                                        <select value={formData.source} onChange={(e) => setFormData({ ...formData, source: e.target.value })} className={selectCls}>
                                            <option value="">--Select--</option>
                                            {["Sendy DB","LeadCandy","Scraping (not LI or Snov)","Scraping-LinkedIn","Client Referral","Web","MSP","Scraping-Snov","Other"].map(v => <option key={v} value={v}>{v}</option>)}
                                        </select>
                                    ) : account.source || 'Not provided'}
                                </dd>
                            </div>
                        </div>
                    </div>

                                {/* Details & Web Card (standalone matching Leads design) */}
                                <div className="bg-white rounded-lg border border-gray-200 p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Globe className="h-3.5 w-3.5 text-blue-500" />
                            <span className="text-xs font-black text-blue-500 uppercase tracking-widest" style={{ fontFamily: 'var(--font-lato)' }}>Details & Web</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
                            <div>
                                <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Phone</dt>
                                <dd className="text-sm text-gray-900">
                                    {isEditing ? <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className={inputCls} /> : account.phone || 'Not provided'}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Industry</dt>
                                <dd className="text-sm text-gray-900">
                                    {isEditing ? (
                                        <select value={formData.industry} onChange={(e) => setFormData({ ...formData, industry: e.target.value })} className={selectCls}>
                                            <option value="">--Select--</option>
                                            {["Agriculture","Automotive","Construction","Consulting","Education","Energy & Utilities","Entertainment","Finance & Banking","Food & Beverage","Government / Public Sector","Healthcare","Manufacturing","Marketing & Publicity","Real Estate","Retail","Technology / Software","Telecommunications","Transportation & Logistics","Other"].map(v => <option key={v} value={v}>{v}</option>)}
                                        </select>
                                    ) : account.industry || 'Not provided'}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Employees</dt>
                                <dd className="text-sm text-gray-900">
                                    {isEditing ? <input type="number" value={formData.numberOfEmployees} onChange={(e) => setFormData({ ...formData, numberOfEmployees: e.target.value })} className={inputCls} /> : account.numberOfEmployees || 'Not provided'}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Annual Revenue</dt>
                                <dd className="text-sm text-gray-900">
                                    {isEditing ? <input type="number" step="0.01" value={formData.annualRevenue} onChange={(e) => setFormData({ ...formData, annualRevenue: e.target.value })} className={inputCls} placeholder="0.00" /> : account.annualRevenue ? `$${Number(account.annualRevenue).toLocaleString()}` : '-'}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Website</dt>
                                <dd className="text-sm text-gray-900">
                                    {isEditing ? <input type="url" value={formData.website} onChange={(e) => setFormData({ ...formData, website: e.target.value })} className={inputCls} /> : account.website ? <a href={account.website.startsWith('http') ? account.website : `https://${account.website}`} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">{account.website}</a> : '-'}
                                </dd>
                            </div>
                            <div className="col-span-2 md:col-span-3">
                                <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Technologies</dt>
                                <dd className="text-sm text-gray-900">
                                    {isEditing ? (
                                        <input type="text" value={formData.technologies} onChange={(e) => setFormData({ ...formData, technologies: e.target.value })} placeholder="e.g. React, Node.js, AWS" className={inputCls} />
                                    ) : account.technologies ? (
                                        <div className="flex flex-wrap gap-1">
                                            {account.technologies.split(/[,-]+/).map((tech: string, i: number) => {
                                                const t = tech.trim();
                                                if (!t) return null;
                                                return <span key={i} className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">{t}</span>;
                                            })}
                                        </div>
                                    ) : 'Not provided'}
                                </dd>
                            </div>
                        </div>
                    </div>




                    {/* ── BILLING ADDRESS ── */}
                    <div className="bg-white rounded-lg border border-gray-200 p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <MapPin className="h-3.5 w-3.5 text-blue-500" />
                            <span className="text-xs font-black text-blue-500 uppercase tracking-widest" style={{ fontFamily: 'var(--font-lato)' }}>Billing Address</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
                            <div className="col-span-2 md:col-span-3">
                                <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Street</dt>
                                <dd className="text-sm text-gray-900">
                                    {isEditing ? <textarea value={formData.billingStreet} onChange={(e) => setFormData({ ...formData, billingStreet: e.target.value })} rows={2} className={textareaCls} /> : account.billingStreet || 'Not provided'}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">City</dt>
                                <dd className="text-sm text-gray-900">{isEditing ? <input type="text" value={formData.billingCity} onChange={(e) => setFormData({ ...formData, billingCity: e.target.value })} className={inputCls} /> : account.billingCity || 'Not provided'}</dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">State / Province</dt>
                                <dd className="text-sm text-gray-900">{isEditing ? <input type="text" value={formData.billingState} onChange={(e) => setFormData({ ...formData, billingState: e.target.value })} className={inputCls} /> : account.billingState || 'Not provided'}</dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Postal Code</dt>
                                <dd className="text-sm text-gray-900">{isEditing ? <input type="text" value={formData.billingPostalCode} onChange={(e) => setFormData({ ...formData, billingPostalCode: e.target.value })} className={inputCls} /> : account.billingPostalCode || 'Not provided'}</dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Country</dt>
                                <dd className="text-sm text-gray-900">{isEditing ? <input type="text" value={formData.billingCountry} onChange={(e) => setFormData({ ...formData, billingCountry: e.target.value })} className={inputCls} /> : account.billingCountry || 'Not provided'}</dd>
                            </div>
                        </div>
                    </div>




                    {/* ── DESCRIPTION ── */}
                    <div className="bg-white rounded-lg border border-gray-200 p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <svg className="h-3.5 w-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                            <span className="text-xs font-black text-blue-500 uppercase tracking-widest" style={{ fontFamily: 'var(--font-lato)' }}>Description</span>
                        </div>
                        <div className="grid grid-cols-1 gap-y-4">
                            <div>
                                <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Description</dt>
                                {isEditing ? (
                                    <dd className="text-sm text-gray-900 whitespace-pre-wrap">
                                        <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} className={textareaCls} />
                                    </dd>
                                ) : (
                                    <div className="space-y-2">
                                        <dd className="text-sm text-gray-900 whitespace-pre-wrap">
                                            {(() => {
                                                const descContent = account.description || '';
                                                const descLines = descContent.split('\n');
                                                if (descLines.length > 10 && !isDescExpanded) {
                                                    return descLines.slice(0, 10).join('\n');
                                                }
                                                return descContent || 'Not provided';
                                            })()}
                                        </dd>
                                        {(account.description || '').split('\n').length > 10 && (account.description || '').length > 300 && (
                                            <button
                                                type="button"
                                                onClick={() => setIsDescExpanded(!isDescExpanded)}
                                                className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline mt-1 inline-flex items-center gap-1 cursor-pointer font-sans"
                                            >
                                                {isDescExpanded ? '– See less' : '+ See more'}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div>
                                <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Company Details</dt>
                                <dd className="text-sm text-gray-900 whitespace-pre-wrap">{isEditing ? <textarea value={formData.companyDetails} onChange={(e) => setFormData({ ...formData, companyDetails: e.target.value })} rows={3} className={textareaCls} /> : account.companyDetails || 'Not provided'}</dd>
                            </div>
                        </div>
                    </div>


                                {/* Delete Safety Banner at the bottom of Main Details */}
                                <div className="bg-red-50/30 border border-red-100 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-8">
                                    <div className="min-w-0">
                                        <p className="text-xs text-red-600/80 font-semibold leading-relaxed" style={{ fontFamily: 'var(--font-lato)' }}>
                                            This will permanently remove <span className="font-bold">{account.name}</span> and <span className="font-bold">{account.activities?.length || 0} activities</span>. Cannot be undone.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsDeleteModalOpen(true)}
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex-shrink-0"
                                        style={{ fontFamily: 'var(--font-lato)' }}
                                    >
                                        <Trash2 size={13} /> Delete Account
                                    </button>
                                </div>
                            </div>
                        )}


                        {activeTab === 'deals' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                                    {/* Column 1: ASSIGNMENTS & OPPORTUNITIES */}
                                    <div className="space-y-6">
                                        {(() => {
                                        const assignments = account.assignments || [];
                                        const totalAssignments = assignments.length;
                                        const activeAssignments = assignments.filter((a: any) => a.status === 'ACTIVE').length;
                                        const finishedAssignments = assignments.filter((a: any) => a.status === 'FINISHED').length;

                                        let filteredAssignments = assignments;
                                        if (assignmentStatusFilter === 'ACTIVE') {
                                            filteredAssignments = assignments.filter((a: any) => a.status === 'ACTIVE');
                                        } else if (assignmentStatusFilter === 'FINISHED') {
                                            filteredAssignments = assignments.filter((a: any) => a.status === 'FINISHED');
                                        }

                                        const assignmentsToShow = isAssignmentsExpanded ? filteredAssignments : filteredAssignments.slice(0, 5);

                                        return (
                                            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                                <div className="px-5 py-3.5 flex items-center justify-between border-b border-gray-100">
                                                    <div className="flex items-center gap-2">
                                                        <svg className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" /></svg>
                                                        <span className="text-xs font-black text-blue-500 uppercase tracking-widest" style={{ fontFamily: 'var(--font-lato)' }}>Assignments</span>
                                                        {assignments.length > 0 && (
                                                            <span className="text-[10px] font-bold text-gray-400 ml-0.5">({assignments.length})</span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Filter Pills */}
                                                <div className="px-5 py-3 border-b border-gray-50 flex items-center gap-1.5" style={{ fontFamily: 'var(--font-lato)' }}>
                                                    <button
                                                        onClick={() => setAssignmentStatusFilter('ACTIVE')}
                                                        className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${
                                                            assignmentStatusFilter === 'ACTIVE'
                                                                ? "bg-gray-900 text-white shadow-sm"
                                                                : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 hover:text-gray-700"
                                                        }`}
                                                    >
                                                        Active {activeAssignments}
                                                    </button>
                                                    <button
                                                        onClick={() => setAssignmentStatusFilter('FINISHED')}
                                                        className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${
                                                            assignmentStatusFilter === 'FINISHED'
                                                                ? "bg-gray-900 text-white shadow-sm"
                                                                : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 hover:text-gray-700"
                                                        }`}
                                                    >
                                                        Finished {finishedAssignments}
                                                    </button>
                                                    <button
                                                        onClick={() => setAssignmentStatusFilter('ALL')}
                                                        className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${
                                                            assignmentStatusFilter === 'ALL'
                                                                ? "bg-gray-900 text-white shadow-sm"
                                                                : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 hover:text-gray-700"
                                                        }`}
                                                    >
                                                        All {totalAssignments}
                                                    </button>
                                                </div>

                                                {/* Assignments list */}
                                                <div className="p-4 bg-gray-50/30 grid grid-cols-1 gap-3">
                                                    {filteredAssignments.length > 0 ? (
                                                        assignmentsToShow.map((asgn: any) => {
                                                            const isFinished = asgn.status === 'FINISHED';
                                                            return (
                                                                <Link
                                                                    key={asgn.id}
                                                                    href={`/candidates/${asgn.candidate?.id}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className={`block rounded-xl p-3.5 transition-all duration-200 cursor-pointer ${
                                                                        isFinished
                                                                            ? 'bg-white/70 border border-gray-100 hover:bg-white hover:opacity-100 shadow-sm'
                                                                            : 'bg-white border border-[#E5E7EB] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)] shadow-sm'
                                                                    }`}
                                                                >
                                                                    <div className="flex items-start justify-between gap-2">
                                                                        <div className="min-w-0 flex-1">
                                                                            <h4 className={`text-xs font-bold leading-tight truncate uppercase tracking-wider ${isFinished ? 'text-gray-400' : 'text-gray-800'}`} style={{ fontFamily: 'var(--font-montserrat)' }}>
                                                                                {asgn.candidate?.fullName || 'Unknown Employee'}
                                                                            </h4>
                                                                            <p className="text-[11px] text-gray-500 mt-0.5">{asgn.candidate?.title || "No Title Listed"}</p>
                                                                        </div>
                                                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase shrink-0 ${asgn.status === "ACTIVE"
                                                                            ? "bg-green-100 text-green-700"
                                                                            : "bg-gray-100 text-gray-500"
                                                                            }`}>
                                                                            {asgn.status === "ACTIVE" ? "Active" : "Finished"}
                                                                        </span>
                                                                    </div>

                                                                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] text-gray-500 font-medium">
                                                                        <span className="flex items-center gap-1">
                                                                            <Calendar size={10} className="text-gray-400" />
                                                                            {asgn.startDate ? (
                                                                                <>
                                                                                    {new Date(asgn.startDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                                                                                    {asgn.endDate && ` - ${new Date(asgn.endDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                                                                                </>
                                                                            ) : 'No dates'}
                                                                        </span>

                                                                        {asgn.clientManagerName && (
                                                                            <span className="flex items-center gap-1">
                                                                                <User size={10} className="text-gray-400" />
                                                                                {asgn.clientManagerName}
                                                                            </span>
                                                                        )}

                                                                        {asgn.endClient && (
                                                                            <span className="flex items-center gap-1">
                                                                                <Building2 size={10} className="text-gray-400" />
                                                                                {asgn.endClient}
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    <div className="mt-2 pt-2 border-t border-gray-100">
                                                                        {asgn.candidate?.featuredTechnologies && asgn.candidate.featuredTechnologies.length > 0 ? (
                                                                            <div className="flex flex-wrap gap-1">
                                                                                {asgn.candidate.featuredTechnologies.slice(0, 3).map((tech: any, i: number) => (
                                                                                    <span key={tech.id || i} className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[9px] font-bold">{tech.name}</span>
                                                                                ))}
                                                                            </div>
                                                                        ) : (
                                                                            <span className="text-[9px] italic text-gray-300">No skills listed</span>
                                                                        )}
                                                                    </div>
                                                                </Link>
                                                            );
                                                        })
                                                    ) : (
                                                        <div className="px-5 py-8 text-center text-xs text-gray-400 italic bg-white rounded-xl border border-dashed border-gray-100">No assignments match the current filter.</div>
                                                    )}
                                                </div>

                                                {/* See More Button for Assignments */}
                                                {filteredAssignments.length > 5 && (
                                                    <button
                                                        onClick={() => setIsAssignmentsExpanded(!isAssignmentsExpanded)}
                                                        className="w-full px-5 py-2.5 text-xs font-semibold text-blue-500 hover:text-blue-700 hover:bg-blue-50/30 transition-colors flex items-center justify-center gap-1 border-t border-gray-100"
                                                        style={{ fontFamily: 'var(--font-lato)' }}
                                                    >
                                                        {isAssignmentsExpanded ? (
                                                            <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
                                                        ) : (
                                                            <><ChevronDown className="w-3.5 h-3.5" /> See {filteredAssignments.length - 5} more</>
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })()}

                                        {/* ── OPPORTUNITIES ── */}
                                    {(() => {
                                        const opps = account.opportunities || [];
                                        const totalOpps = opps.length;

                                        const isClosedOpp = (opp: any) => {
                                            if (opp.isArchived) return true;
                                            const stage = (opp.stage || '').toLowerCase();
                                            return stage.includes('closed') || stage.includes('won') || stage.includes('lost');
                                        };

                                        const activeOpps = opps.filter((o: any) => !isClosedOpp(o)).length;
                                        const closedOpps = opps.filter((o: any) => isClosedOpp(o)).length;

                                        let filteredOpps = opps;
                                        if (oppStatusFilter === 'OPEN') {
                                            filteredOpps = opps.filter((o: any) => !isClosedOpp(o));
                                        } else if (oppStatusFilter === 'CLOSED') {
                                            filteredOpps = opps.filter((o: any) => isClosedOpp(o));
                                        }

                                        const oppsToShow = isOppsExpanded ? filteredOpps : filteredOpps.slice(0, 5);

                                        return (
                                            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                                <div className="px-5 py-3.5 flex items-center justify-between border-b border-gray-100">
                                                    <div className="flex items-center gap-2">
                                                        <TrendingUp className="h-4 w-4 text-blue-500" />
                                                        <span className="text-xs font-black text-blue-500 uppercase tracking-widest" style={{ fontFamily: 'var(--font-lato)' }}>Opportunities</span>
                                                        {opps.length > 0 && (
                                                            <span className="text-[10px] font-bold text-gray-400 ml-0.5">({opps.length})</span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Filter Pills */}
                                                <div className="px-5 py-3 border-b border-gray-50 flex items-center gap-1.5" style={{ fontFamily: 'var(--font-lato)' }}>
                                                    <button
                                                        onClick={() => setOppStatusFilter('OPEN')}
                                                        className={"px-3 py-1 rounded-full text-[10px] font-bold transition-all " + (oppStatusFilter === 'OPEN' ? "bg-gray-900 text-white shadow-sm" : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 hover:text-gray-700")}
                                                    >
                                                        Active {activeOpps}
                                                    </button>
                                                    <button
                                                        onClick={() => setOppStatusFilter('CLOSED')}
                                                        className={"px-3 py-1 rounded-full text-[10px] font-bold transition-all " + (oppStatusFilter === 'CLOSED' ? "bg-gray-900 text-white shadow-sm" : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 hover:text-gray-700")}
                                                    >
                                                        Closed {closedOpps}
                                                    </button>
                                                    <button
                                                        onClick={() => setOppStatusFilter('ALL')}
                                                        className={"px-3 py-1 rounded-full text-[10px] font-bold transition-all " + (oppStatusFilter === 'ALL' ? "bg-gray-900 text-white shadow-sm" : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 hover:text-gray-700")}
                                                    >
                                                        All {totalOpps}
                                                    </button>
                                                </div>

                                                {/* Opportunities list */}
                                                <div className="p-4 bg-gray-50/30 grid grid-cols-1 gap-3">
                                                    {filteredOpps.length > 0 ? (
                                                        oppsToShow.map((opp: any) => {
                                                            const isMuted = isClosedOpp(opp);
                                                            const isWon = (opp.stage || '').toLowerCase().includes('won');
                                                            const isLost = (opp.stage || '').toLowerCase().includes('lost');

                                                            let badgeBg = 'bg-blue-100 text-blue-700';
                                                            let badgeText = opp.stage || 'Open';
                                                            if (isWon) {
                                                                badgeBg = 'bg-green-100 text-green-700';
                                                                badgeText = 'Closed Won';
                                                            } else if (isLost) {
                                                                badgeBg = 'bg-red-100 text-red-600';
                                                                badgeText = 'Closed Lost';
                                                            } else if (isMuted) {
                                                                badgeBg = 'bg-gray-100 text-gray-500';
                                                                badgeText = 'Closed';
                                                            }

                                                            const amountStr = opp.amount != null && opp.amount > 0 ? "$" + Number(opp.amount).toLocaleString('en-US') : null;
                                                            const jobsCount = opp.jobs?.length || 0;
                                                            const candidatesCount = opp.candidates?.length || 0;

                                                            return (
                                                                <Link
                                                                    key={opp.id}
                                                                    href={"/commercial/opportunities/" + opp.id}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className={"block rounded-xl p-3.5 transition-all duration-200 cursor-pointer " + (isMuted ? 'bg-white/70 border border-gray-100 hover:bg-white hover:opacity-100 shadow-sm' : 'bg-white border border-[#E5E7EB] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)] shadow-sm')}
                                                                >
                                                                    <div className="flex items-start justify-between gap-2">
                                                                        <div className="min-w-0 flex-1">
                                                                            <h4 className={"text-xs font-bold leading-tight truncate uppercase tracking-wider " + (isMuted ? 'text-gray-400' : 'text-gray-800')} style={{ fontFamily: 'var(--font-montserrat)' }}>
                                                                                {opp.title}
                                                                            </h4>
                                                                        </div>
                                                                        <span className={"inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase shrink-0 " + badgeBg}>
                                                                            {badgeText}
                                                                        </span>
                                                                    </div>

                                                                    <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-500 font-medium flex-wrap">
                                                                        {amountStr && (
                                                                            <span className="flex items-center gap-1 font-bold text-gray-700">
                                                                                <DollarSign size={10} className="text-emerald-500" />
                                                                                {amountStr}
                                                                            </span>
                                                                        )}
                                                                        {opp.contactName && (
                                                                            <span className="flex items-center gap-1 truncate">
                                                                                <User size={10} className="text-gray-400" />
                                                                                {opp.contactName}
                                                                            </span>
                                                                        )}
                                                                        {jobsCount > 0 && (
                                                                            <span className="flex items-center gap-1">
                                                                                <Briefcase size={10} className="text-gray-400" />
                                                                                {jobsCount} {jobsCount === 1 ? 'Job' : 'Jobs'}
                                                                            </span>
                                                                        )}
                                                                        {candidatesCount > 0 && (
                                                                            <span className="flex items-center gap-1">
                                                                                <Users size={10} className="text-gray-400" />
                                                                                {candidatesCount} {candidatesCount === 1 ? 'Candidate' : 'Candidates'}
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-1">
                                                                        {opp.stage && (
                                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[9px] font-bold">
                                                                                {opp.stage}
                                                                            </span>
                                                                        )}
                                                                        {opp.project && (
                                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 text-[9px] font-bold">
                                                                                {opp.project}
                                                                            </span>
                                                                        )}
                                                                        {opp.type && (
                                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[9px] font-bold">
                                                                                {opp.type}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </Link>
                                                            );
                                                        })
                                                    ) : (
                                                        <div className="px-5 py-8 text-center text-xs text-gray-400 italic bg-white rounded-xl border border-dashed border-gray-100">
                                                            No opportunities match the current filter.
                                                        </div>
                                                    )}
                                                </div>

                                                {/* See More Button for Opportunities */}
                                                {filteredOpps.length > 5 && (
                                                    <button
                                                        onClick={() => setIsOppsExpanded(!isOppsExpanded)}
                                                        className="w-full px-5 py-2.5 text-xs font-semibold text-blue-500 hover:text-blue-700 hover:bg-blue-50/30 transition-colors flex items-center justify-center gap-1 border-t border-gray-100"
                                                        style={{ fontFamily: 'var(--font-lato)' }}
                                                    >
                                                        {isOppsExpanded ? (
                                                            <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
                                                        ) : (
                                                            <><ChevronDown className="w-3.5 h-3.5" /> See {filteredOpps.length - 5} more</>
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })()}
                                    </div>

                                    {/* Column 2: JOB ORDERS */}
                                    <div className="space-y-6">
                                        {(() => {
                                        const jobs = (account.opportunities || []).flatMap((opp: any) =>
                                            (opp.jobs || []).map((j: any) => ({
                                                ...j,
                                                opportunityId: opp.id,
                                                client: account.name
                                            }))
                                        );
                                        const uniqueJobs = jobs.filter((j: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.id === j.id) === i);
                                        const totalJobs = uniqueJobs.length;
                                        const activeJobs = uniqueJobs.filter((j: any) => j.status === 'OPEN').length;
                                        const closedJobs = uniqueJobs.filter((j: any) => j.status !== 'OPEN').length;

                                        let filteredJobs = uniqueJobs;
                                        if (jobStatusFilter === 'OPEN') {
                                            filteredJobs = uniqueJobs.filter((j: any) => j.status === 'OPEN');
                                        } else if (jobStatusFilter === 'CLOSED') {
                                            filteredJobs = uniqueJobs.filter((j: any) => j.status !== 'OPEN');
                                        }

                                        const jobsToShow = isJobsExpanded ? filteredJobs : filteredJobs.slice(0, 5);

                                        return (
                                            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                                <div className="px-5 py-3.5 flex items-center justify-between border-b border-gray-100">
                                                    <div className="flex items-center gap-2">
                                                        <Briefcase className="h-4 w-4 text-blue-500" />
                                                        <span className="text-xs font-black text-blue-500 uppercase tracking-widest" style={{ fontFamily: 'var(--font-lato)' }}>Job Orders</span>
                                                        {uniqueJobs.length > 0 && (
                                                            <span className="text-[10px] font-bold text-gray-400 ml-0.5">({uniqueJobs.length})</span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Filter Pills exactly like HR */}
                                                <div className="px-5 py-3 border-b border-gray-50 flex items-center gap-1.5" style={{ fontFamily: 'var(--font-lato)' }}>
                                                    <button
                                                        onClick={() => setJobStatusFilter('OPEN')}
                                                        className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${
                                                            jobStatusFilter === 'OPEN'
                                                                ? "bg-gray-900 text-white shadow-sm"
                                                                : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 hover:text-gray-700"
                                                        }`}
                                                    >
                                                        Active {activeJobs}
                                                    </button>
                                                    <button
                                                        onClick={() => setJobStatusFilter('CLOSED')}
                                                        className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${
                                                            jobStatusFilter === 'CLOSED'
                                                                ? "bg-gray-900 text-white shadow-sm"
                                                                : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 hover:text-gray-700"
                                                        }`}
                                                    >
                                                        Closed {closedJobs}
                                                    </button>
                                                    <button
                                                        onClick={() => setJobStatusFilter('ALL')}
                                                        className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${
                                                            jobStatusFilter === 'ALL'
                                                                ? "bg-gray-900 text-white shadow-sm"
                                                                : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 hover:text-gray-700"
                                                        }`}
                                                    >
                                                        All {totalJobs}
                                                    </button>
                                                </div>

                                                {/* Cards Grid layout exactly like HR */}
                                                <div className="p-4 bg-gray-50/30 grid grid-cols-1 gap-3">
                                                    {filteredJobs.length > 0 ? (
                                                        jobsToShow.map((job: any) => {
                                                            const isMuted = job.status !== 'OPEN';
                                                            const skills = job.mandatorySkills ? job.mandatorySkills.split(",").map((s: string) => s.trim()).filter(Boolean).slice(0, 3) : [];
                                                            return (
                                                                <Link
                                                                    key={job.id}
                                                                    href={`/jobs/${job.id}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className={`block rounded-xl p-3.5 transition-all duration-200 cursor-pointer ${
                                                                        isMuted
                                                                            ? 'bg-white/70 border border-gray-100 hover:bg-white hover:opacity-100'
                                                                            : 'bg-white border border-[#E5E7EB] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)] shadow-sm'
                                                                    }`}
                                                                >
                                                                    <div className="flex items-start justify-between gap-2">
                                                                        <div className="min-w-0 flex-1">
                                                                            <h4 className={`text-xs font-bold leading-tight truncate uppercase tracking-wider ${isMuted ? 'text-gray-400' : 'text-gray-800'}`} style={{ fontFamily: 'var(--font-montserrat)' }}>{job.title}</h4>
                                                                        </div>
                                                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase shrink-0 ${job.status === "OPEN"
                                                                            ? "bg-green-100 text-green-700"
                                                                            : "bg-gray-100 text-gray-500"
                                                                            }`}>
                                                                            {job.status === "OPEN" ? "Open" : "Closed"}
                                                                        </span>
                                                                    </div>

                                                                    <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-500 font-medium">
                                                                        {job.clientManager && (
                                                                            <span className="flex items-center gap-1">
                                                                                <User size={10} className="text-gray-400" />
                                                                                {job.clientManager}
                                                                            </span>
                                                                        )}
                                                                        <span className="flex items-center gap-1">
                                                                            <Users size={10} className="text-gray-400" />
                                                                            {job._count?.applications || 0}
                                                                        </span>
                                                                        {(job.location || job.workType) && (
                                                                            <span className="flex items-center gap-1 truncate">
                                                                                <MapPin size={10} className="text-gray-400" />
                                                                                {[job.location, job.workType].filter(Boolean).join(" · ")}
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    <div className="mt-2 pt-2 border-t border-gray-100">
                                                                        {skills.length > 0 ? (
                                                                            <div className="flex flex-wrap gap-1">
                                                                                {skills.map((skill: string, i: number) => (
                                                                                    <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[9px] font-bold">{skill}</span>
                                                                                ))}
                                                                            </div>
                                                                        ) : (
                                                                            <span className="text-[9px] italic text-gray-300">No skills listed</span>
                                                                        )}
                                                                    </div>
                                                                </Link>
                                                            );
                                                        })
                                                    ) : (
                                                        <div className="px-5 py-8 text-center text-xs text-gray-400 italic bg-white rounded-xl border border-dashed border-gray-100">No jobs match the current filter.</div>
                                                    )}
                                                </div>

                                                {/* See More Button for Job Orders */}
                                                {filteredJobs.length > 5 && (
                                                    <button
                                                        onClick={() => setIsJobsExpanded(!isJobsExpanded)}
                                                        className="w-full px-5 py-2.5 text-xs font-semibold text-blue-500 hover:text-blue-700 hover:bg-blue-50/30 transition-colors flex items-center justify-center gap-1 border-t border-gray-100"
                                                        style={{ fontFamily: 'var(--font-lato)' }}
                                                    >
                                                        {isJobsExpanded ? (
                                                            <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
                                                        ) : (
                                                            <><ChevronDown className="w-3.5 h-3.5" /> See {filteredJobs.length - 5} more</>
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })()}
                                    </div>

                                </div>
                            </div>
                        )}

                        {activeTab === 'contacts' && (() => {
                            const allContacts = localContacts;
                            const filteredContacts = allContacts.filter((c: any) => {
                                const q = contactSearchQuery.toLowerCase().trim();
                                if (!q) return true;
                                return (
                                    c.fullName.toLowerCase().includes(q) ||
                                    (c.title || "").toLowerCase().includes(q) ||
                                    (c.email || "").toLowerCase().includes(q)
                                );
                            });
                            const kdmContacts = filteredContacts.filter((c: any) => c.isKdm);
                            const otherContacts = filteredContacts.filter((c: any) => !c.isKdm);

                            const renderContactCard = (contact: any) => (
                                <div
                                    key={contact.id}
                                    // A person at a PROSPECT account is still a LEAD until an Opp is won.
                                    // Open them in the matching detail view (Leads keep their secondary
                                    // contacts; only real client contacts use the Contacts view).
                                    onClick={() => {
                                        const isLead = contact.type === 'LEAD' || contact.type === 'FORMER_LEAD';
                                        window.open(`/commercial/${isLead ? 'leads' : 'contacts'}/${contact.id}`, '_blank', 'noopener,noreferrer');
                                    }}
                                    className="bg-white rounded-lg border border-gray-100 p-4 hover:border-blue-200 hover:shadow-sm cursor-pointer transition-all relative group flex flex-col justify-between"
                                >
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold uppercase border border-blue-100 flex-shrink-0">
                                                {contact.fullName.slice(0, 2)}
                                            </div>
                                            <div className="min-w-0 flex-1 space-y-1">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span 
                                                        className="text-xs font-bold text-gray-900 group-hover:text-blue-600 transition-colors"
                                                        style={{ fontFamily: 'var(--font-montserrat)' }}
                                                    >
                                                        {contact.fullName}
                                                    </span>
                                                    {(contact.type === 'FORMER_CLIENT_CONTACT' || contact.type === 'FORMER_LEAD') && (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-slate-100 text-slate-600 border border-slate-200">
                                                            Former
                                                        </span>
                                                    )}
                                                    {(() => {
                                                        const role = (contact.buyerRole || (contact.isKdm ? 'kdm' : '')).toLowerCase();
                                                        if (role === 'kdm') return (
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-200">
                                                                ⭐ KDM
                                                            </span>
                                                        );
                                                        if (role === 'champion') return (
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-amber-50 text-amber-800 border border-amber-300">
                                                                🏆 Champion
                                                            </span>
                                                        );
                                                        if (role === 'influencer') return (
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-purple-50 text-purple-700 border border-purple-200">
                                                                🗣️ Influencer
                                                            </span>
                                                        );
                                                        if (role === 'blocker') return (
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-red-50 text-red-700 border border-red-200">
                                                                ⛔ Blocker
                                                            </span>
                                                        );
                                                        return null;
                                                    })()}
                                                </div>
                                                <p className="text-[11px] text-gray-500 truncate leading-tight">
                                                    {contact.title || "No role specified"}
                                                </p>
                                                {contact.communicationStatus ? (
                                                    <div className="flex items-center gap-1.5 leading-tight">
                                                        <span className={`h-2 w-2 rounded-full flex-shrink-0 ${communicationStatusStyle(contact.communicationStatus).dot}`} />
                                                        <span className={`text-[11px] font-semibold ${communicationStatusStyle(contact.communicationStatus).text}`}>
                                                            {contact.communicationStatus}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1.5 leading-tight">
                                                        <span className="h-2 w-2 rounded-full flex-shrink-0 bg-gray-200" />
                                                        <span className="text-[11px] text-gray-400 italic">No communication status</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {contact.isArchived && (
                                        <div className="mt-2 pt-2 border-t border-gray-50 text-[10px] text-amber-600 font-bold uppercase tracking-wider flex items-center gap-1">
                                            ⚠️ Archived: {contact.archiveReason || 'No reason provided'}
                                        </div>
                                    )}
                                </div>
                            );

                            return (
                                <div className="bg-white rounded-lg border border-gray-200 p-6">
                                    <div className="flex items-center justify-between mb-6">
                                        <div className="flex items-center gap-2">
                                            <User className="h-4 w-4 text-blue-500" />
                                            <span className="text-xs font-black text-blue-500 uppercase tracking-widest" style={{ fontFamily: 'var(--font-lato)' }}>Contacts Directory</span>
                                            <span className="text-[10px] font-bold text-gray-400 ml-0.5">
                                                ({allContacts.length})
                                            </span>
                                        </div>
                                        <Link
                                            href="/commercial/contacts/new"
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-all"
                                            style={{ fontFamily: 'var(--font-lato)' }}
                                        >
                                            <Plus size={12} /> Add Contact
                                        </Link>
                                    </div>



                                    {/* Real-time internal Contacts Search Bar */}
                                    <div className="mb-6 relative max-w-md">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                            <Search size={15} />
                                        </div>
                                        <input
                                            type="text"
                                            value={contactSearchQuery}
                                            onChange={(e) => setContactSearchQuery(e.target.value)}
                                            placeholder="Search contacts by name, role, or email..."
                                            className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold focus:bg-white focus:border-blue-500 outline-none transition-all placeholder:text-gray-400"
                                            style={{ fontFamily: 'var(--font-lato)' }}
                                        />
                                        {contactSearchQuery && (
                                            <button
                                                type="button"
                                                onClick={() => setContactSearchQuery("")}
                                                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400 hover:text-gray-600"
                                            >
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>

                                    {/* Beautiful 2-column Layout */}
                                    {allContacts.length === 0 ? (
                                        <div className="py-12 text-center text-xs text-gray-400 font-bold uppercase tracking-wider">No contacts linked to this account.</div>
                                    ) : (
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                            {/* Left Column: KEY DECISION MAKERS */}
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-2 mb-2 pb-1 border-b border-gray-100/50">
                                                    <span className="text-[11px] font-black text-blue-500 uppercase tracking-widest" style={{ fontFamily: 'var(--font-lato)' }}>Key Decision Makers</span>
                                                    <span className="text-[10px] font-bold text-gray-400 ml-0.5">({kdmContacts.length})</span>
                                                    <div className="h-px bg-blue-100 flex-1" />
                                                </div>
                                                {kdmContacts.length === 0 ? (
                                                    <div className="py-6 text-center text-[11px] text-gray-400 italic border border-dashed border-gray-100 rounded-lg bg-gray-50/50">
                                                        {contactSearchQuery ? "No matching KDMs." : "No KDMs configured."}
                                                    </div>
                                                ) : (
                                                    <div className="space-y-4">
                                                        {(isKdmExpanded ? kdmContacts : kdmContacts.slice(0, 5)).map((contact: any) => renderContactCard(contact))}
                                                        {kdmContacts.length > 5 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setIsKdmExpanded(!isKdmExpanded)}
                                                                className="w-full py-2 px-3 text-xs font-semibold text-blue-500 hover:text-blue-700 hover:bg-blue-50/50 transition-colors flex items-center justify-center gap-1 rounded-lg border border-gray-100 shadow-sm mt-2"
                                                                style={{ fontFamily: 'var(--font-lato)' }}
                                                            >
                                                                {isKdmExpanded ? (
                                                                    <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
                                                                ) : (
                                                                    <><ChevronDown className="w-3.5 h-3.5" /> See all ({kdmContacts.length})</>
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Right Column: Other Contacts */}
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-2 mb-2 pb-1 border-b border-gray-100/50">
                                                    <span className="text-[11px] font-black text-blue-500 uppercase tracking-widest" style={{ fontFamily: 'var(--font-lato)' }}>Other Contacts</span>
                                                    <span className="text-[10px] font-bold text-gray-400 ml-0.5">({otherContacts.length})</span>
                                                    <div className="h-px bg-blue-100 flex-1" />
                                                </div>
                                                {otherContacts.length === 0 ? (
                                                    <div className="py-6 text-center text-[11px] text-gray-400 italic border border-dashed border-gray-100 rounded-lg bg-gray-50/50">
                                                        {contactSearchQuery ? "No matching contacts." : "No other contacts linked."}
                                                    </div>
                                                ) : (
                                                    <div className="space-y-4">
                                                        {(isOtherContactsExpanded ? otherContacts : otherContacts.slice(0, 5)).map((contact: any) => renderContactCard(contact))}
                                                        {otherContacts.length > 5 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setIsOtherContactsExpanded(!isOtherContactsExpanded)}
                                                                className="w-full py-2 px-3 text-xs font-semibold text-blue-500 hover:text-blue-700 hover:bg-blue-50/50 transition-colors flex items-center justify-center gap-1 rounded-lg border border-gray-100 shadow-sm mt-2"
                                                                style={{ fontFamily: 'var(--font-lato)' }}
                                                            >
                                                                {isOtherContactsExpanded ? (
                                                                    <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
                                                                ) : (
                                                                    <><ChevronDown className="w-3.5 h-3.5" /> See all ({otherContacts.length})</>
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* RELATIONSHIP MAP / ORG CHART SECTION */}
                                    <div className="mt-8 pt-4">
                                        <div className="flex items-center justify-between mb-6">
                                            <div className="flex items-center gap-2">
                                                <Network className="h-4 w-4 text-blue-500" />
                                                <span className="text-xs font-black text-blue-500 uppercase tracking-widest" style={{ fontFamily: 'var(--font-lato)' }}>Relationship Map & Org Chart</span>
                                            </div>
                                            {isUpdatingRelation && (
                                                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600">
                                                    <Loader2 className="h-3 w-3 animate-spin" /> Saving relationship...
                                                </div>
                                            )}
                                        </div>

                                        <RelationshipMapCanvas
                                            account={account}
                                            contacts={localContacts}
                                            customRelationships={localRelationships}
                                            onContactsChange={setLocalContacts}
                                            onRelationshipsChange={setLocalRelationships}
                                            onError={(msg) => setNotifyModal({ open: true, title: "Relationship Map Error", description: msg, variant: "danger" })}
                                        />
                                    </div>
                                </div>
                            );
                        })()}

                        {activeTab === 'followup' && (
                            <>
                            {/* Follow-up Status Banner */}
                            {formData.nextFu ? (
                                <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-4 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
                                            <CalendarCheck className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-emerald-800" style={{ fontFamily: 'var(--font-lato)' }}>Follow-up scheduled</h4>
                                            <p className="text-xs text-emerald-600 mt-0.5" style={{ fontFamily: 'var(--font-lato)' }}>
                                                Next touch planned for {formatFollowUpDate(formData.nextFu, formData.dueDateTimezone || 'GMT-3')}.
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleRescheduleFocus}
                                        className="px-3 py-1.5 bg-white border border-emerald-200 text-emerald-700 hover:text-emerald-800 text-xs font-bold rounded-lg hover:bg-emerald-50 transition-colors self-start sm:self-center shadow-sm"
                                        style={{ fontFamily: 'var(--font-lato)' }}
                                    >
                                        Reschedule
                                    </button>
                                </div>
                            ) : (
                                <div className="bg-amber-50/50 border border-amber-100 rounded-lg p-4 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
                                            <CalendarOff className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-amber-800" style={{ fontFamily: 'var(--font-lato)' }}>No follow-up scheduled</h4>
                                            <p className="text-xs text-amber-600 mt-0.5" style={{ fontFamily: 'var(--font-lato)' }}>This account has no next touch planned.</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleRescheduleFocus}
                                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors self-start sm:self-center shadow-sm"
                                        style={{ fontFamily: 'var(--font-lato)' }}
                                    >
                                        Schedule follow-up
                                    </button>
                                </div>
                            )}

                            <div className="bg-white rounded-lg border border-gray-100 p-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <Calendar className="h-3.5 w-3.5 text-blue-500" />
                                    <span className="text-xs font-black text-blue-500 uppercase tracking-widest" style={{ fontFamily: 'var(--font-lato)' }}>Follow Up</span>
                                    <div className="h-px bg-gray-100 flex-1" />
                                    {isSavingFu && <span className="text-xs text-blue-600 animate-pulse">Saving...</span>}
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
                                    <div>
                                        <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Next FU</dt>
                                        <dd className="relative">
                                            <input
                                                id="fu-date-input"
                                                type="datetime-local"
                                                value={formData.nextFu}
                                                onChange={(e) => setFormData({ ...formData, nextFu: e.target.value })}
                                                onBlur={async (e) => {
                                                    const current = account.nextFu ? new Date(account.nextFu).toISOString().slice(0, 16) : "";
                                                    if (e.target.value === current) return;
                                                    setIsSavingFu(true);
                                                    try {
                                                        const res = await updateAccount(account.id, {
                                                            nextFu: e.target.value ? new Date(e.target.value) : null
                                                        });
                                                        if (!res.success) throw new Error(res.error || "Failed to save Follow Up");
                                                        router.refresh();
                                                    } catch (err: any) {
                                                        alert(`Failed to save Next FU: ${err?.message || 'Unknown error'}`);
                                                    } finally {
                                                        setIsSavingFu(false);
                                                    }
                                                }}
                                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:border-blue-500 outline-none transition-all font-medium text-sm"
                                            />
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Timezone (GMT)</dt>
                                        <dd>
                                            <select
                                                value={formData.dueDateTimezone || "GMT-3"}
                                                onChange={async (e) => {
                                                    const selectedGmt = e.target.value;
                                                    setFormData({ ...formData, dueDateTimezone: selectedGmt });
                                                    setIsSavingFu(true);
                                                    try {
                                                        const res = await updateAccount(account.id, {
                                                            dueDateTimezone: selectedGmt,
                                                            nextFu: formData.nextFu ? new Date(formData.nextFu) : null
                                                        });
                                                        if (!res.success) throw new Error(res.error || "Failed to save Timezone");
                                                        router.refresh();
                                                    } catch (err: any) {
                                                        alert(`Failed to save Timezone: ${err?.message || 'Unknown error'}`);
                                                    } finally {
                                                        setIsSavingFu(false);
                                                    }
                                                }}
                                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:border-blue-500 outline-none transition-all font-medium text-sm"
                                            >
                                                {['GMT-12','GMT-11','GMT-10','GMT-9','GMT-8','GMT-7','GMT-6','GMT-5','GMT-4','GMT-3','GMT-2','GMT-1','GMT+0','GMT+1','GMT+2','GMT+3','GMT+4','GMT+5','GMT+5:30','GMT+6','GMT+7','GMT+8','GMT+9','GMT+9:30','GMT+10','GMT+11','GMT+12','GMT+13','GMT+14'].map(tz => (
                                                    <option key={tz} value={tz}>{tz}</option>
                                                ))}
                                            </select>
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Cycle Complete</dt>
                                        <dd className="flex items-center h-[38px]">
                                            <input
                                                type="checkbox"
                                                checked={formData.nextFuCompleted}
                                                onChange={async (e) => {
                                                    const checked = e.target.checked;
                                                    setFormData({ ...formData, nextFuCompleted: checked });
                                                    setIsSavingFu(true);
                                                    try {
                                                        const res = await updateAccount(account.id, { nextFuCompleted: checked });
                                                        if (!res.success) throw new Error(res.error || "Failed to save FU Completed");
                                                        router.refresh();
                                                    } catch (err: any) {
                                                        alert(`Failed to save Cycle Complete: ${err?.message || 'Unknown error'}`);
                                                        setFormData(prev => ({ ...prev, nextFuCompleted: !checked }));
                                                    } finally {
                                                        setIsSavingFu(false);
                                                    }
                                                }}
                                                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                                            />
                                        </dd>
                                    </div>
                                </div>
                            </div>
                        </>
                        )}

                        {activeTab === 'docs' && (
                            <div className="space-y-6">
                                <div className="bg-white rounded-lg border border-gray-100 p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <FileText className="h-3.5 w-3.5 text-blue-500" />
                            <span className="text-xs font-black text-blue-500 uppercase tracking-widest" style={{ fontFamily: 'var(--font-lato)' }}>Documents</span>
                            <div className="h-px bg-gray-100 flex-1" />
                        </div>

                        <p className="text-[11px] text-gray-400 mb-4 font-semibold uppercase tracking-wider">
                        Supported file formats: <span className="text-gray-500">.PDF & .DOC</span>
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {/* NDA BADGE */}
                            <div className="flex flex-col">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                                    NDA
                                </label>
                                <input type="hidden" name="ndaUrl" value={formData.ndaUrl || ''} />
                                <input type="hidden" name="ndaDate" value={formData.ndaDate || ''} />
                                <div className="space-y-2">
                                    {parseAttachedFiles(formData.ndaUrl, "NDA Document").map((file, idx) => (
                                        <div key={idx} className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100 shadow-sm transition-all hover:bg-blue-100/50">
                                            <FileText size={18} className="text-blue-500 flex-shrink-0" />
                                            <div className="flex flex-col min-w-0 flex-1">
                                                <a href={getViewableUrl(file.url)} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors truncate">
                                                    {file.name} <ExternalLink size={12} className="flex-shrink-0" />
                                                </a>
                                                {file.date && (
                                                    <span className="text-[10px] text-gray-400 mt-0.5 font-medium">Uploaded {new Date(file.date).toLocaleDateString()}</span>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setNdaDeleteIndex(idx);
                                                    setShowNdaRemoveConfirm(true);
                                                }}
                                                className="p-1.5 rounded-full hover:bg-red-100 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}

                                    {parseAttachedFiles(formData.ndaUrl, "NDA Document").length < 4 && (
                                        <FileDropzone
                                            onFileSelect={(file) => handleDocumentUpload(file, 'nda')}
                                            isUploading={ndaUploading}
                                            label="Attach NDA"
                                            compact
                                            accept=".pdf,.doc,.docx"
                                        />
                                    )}
                                </div>
                            </div>

                            {/* MSA BADGE */}
                            <div className="flex flex-col">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                                    MSA
                                </label>
                                <input type="hidden" name="msaUrl" value={formData.msaUrl || ''} />
                                <input type="hidden" name="msaDate" value={formData.msaDate || ''} />
                                <div className="space-y-2">
                                    {parseAttachedFiles(formData.msaUrl, "MSA Document").map((file, idx) => (
                                        <div key={idx} className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100 shadow-sm transition-all hover:bg-blue-100/50">
                                            <FileText size={18} className="text-blue-500 flex-shrink-0" />
                                            <div className="flex flex-col min-w-0 flex-1">
                                                <a href={getViewableUrl(file.url)} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors truncate">
                                                    {file.name} <ExternalLink size={12} className="flex-shrink-0" />
                                                </a>
                                                {file.date && (
                                                    <span className="text-[10px] text-gray-400 mt-0.5 font-medium">Uploaded {new Date(file.date).toLocaleDateString()}</span>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setMsaDeleteIndex(idx);
                                                    setShowMsaRemoveConfirm(true);
                                                }}
                                                className="p-1.5 rounded-full hover:bg-red-100 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}

                                    {parseAttachedFiles(formData.msaUrl, "MSA Document").length < 4 && (
                                        <FileDropzone
                                            onFileSelect={(file) => handleDocumentUpload(file, 'msa')}
                                            isUploading={msaUploading}
                                            label="Attach MSA"
                                            compact
                                            accept=".pdf,.doc,.docx"
                                        />
                                    )}
                                </div>
                            </div>

                            {/* OTHER BADGE */}
                            <div className="flex flex-col">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                                    Other
                                </label>
                                <input type="hidden" name="otherUrl" value={formData.otherUrl || ''} />
                                <input type="hidden" name="otherDate" value={formData.otherDate || ''} />
                                <div className="space-y-2">
                                    {parseAttachedFiles(formData.otherUrl, "Other Document").map((file, idx) => (
                                        <div key={idx} className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100 shadow-sm transition-all hover:bg-blue-100/50">
                                            <FileText size={18} className="text-blue-500 flex-shrink-0" />
                                            <div className="flex flex-col min-w-0 flex-1">
                                                <a href={getViewableUrl(file.url)} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors truncate">
                                                    {file.name} <ExternalLink size={12} className="flex-shrink-0" />
                                                </a>
                                                {file.date && (
                                                    <span className="text-[10px] text-gray-400 mt-0.5 font-medium">Uploaded {new Date(file.date).toLocaleDateString()}</span>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setOtherDeleteIndex(idx);
                                                    setShowOtherRemoveConfirm(true);
                                                }}
                                                className="p-1.5 rounded-full hover:bg-red-100 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}

                                    {parseAttachedFiles(formData.otherUrl, "Other Document").length < 4 && (
                                        <FileDropzone
                                            onFileSelect={(file) => handleDocumentUpload(file, 'other')}
                                            isUploading={otherUploading}
                                            label="Attach Other"
                                            compact
                                            accept=".pdf,.doc,.docx"
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* REMOVE NDA CONFIRMATION MODAL */}
                    <ConfirmModal
                        isOpen={showNdaRemoveConfirm}
                        onClose={() => {
                            setShowNdaRemoveConfirm(false);
                            setNdaDeleteIndex(null);
                        }}
                        onConfirm={async () => {
                            setShowNdaRemoveConfirm(false);
                            const current = parseAttachedFiles(formData.ndaUrl, "NDA Document");
                            const updated = current.filter((_, i) => i !== ndaDeleteIndex);
                            const newUrlStr = updated.length === 0 ? "" : JSON.stringify(updated);
                            const updatedFormData = {
                                ...formData,
                                ndaUrl: newUrlStr,
                                ndaDate: updated.length === 0 ? "" : formData.ndaDate
                            };
                            setNdaDeleteIndex(null);
                            setFormData(updatedFormData);
                            const saveRes = await updateAccount(account.id, updatedFormData);
                            if (saveRes.success) {
                                router.refresh();
                            } else {
                                console.error("Failed to save changes after document deletion:", saveRes.error);
                            }
                        }}
                        title="Remove NDA Document"
                        description="Are you sure you want to remove this NDA document? This action takes effect immediately."
                        confirmLabel="Remove"
                        cancelLabel="Cancel"
                        variant="danger"
                    />

                    {/* REMOVE MSA CONFIRMATION MODAL */}
                    <ConfirmModal
                        isOpen={showMsaRemoveConfirm}
                        onClose={() => {
                            setShowMsaRemoveConfirm(false);
                            setMsaDeleteIndex(null);
                        }}
                        onConfirm={async () => {
                            setShowMsaRemoveConfirm(false);
                            const current = parseAttachedFiles(formData.msaUrl, "MSA Document");
                            const updated = current.filter((_, i) => i !== msaDeleteIndex);
                            const newUrlStr = updated.length === 0 ? "" : JSON.stringify(updated);
                            const updatedFormData = {
                                ...formData,
                                msaUrl: newUrlStr,
                                msaDate: updated.length === 0 ? "" : formData.msaDate
                            };
                            setMsaDeleteIndex(null);
                            setFormData(updatedFormData);
                            const saveRes = await updateAccount(account.id, updatedFormData);
                            if (saveRes.success) {
                                router.refresh();
                            } else {
                                console.error("Failed to save changes after document deletion:", saveRes.error);
                            }
                        }}
                        title="Remove MSA Document"
                        description="Are you sure you want to remove this MSA document? This action takes effect immediately."
                        confirmLabel="Remove"
                        cancelLabel="Cancel"
                        variant="danger"
                    />

                    {/* REMOVE OTHER CONFIRMATION MODAL */}
                    <ConfirmModal
                        isOpen={showOtherRemoveConfirm}
                        onClose={() => {
                            setShowOtherRemoveConfirm(false);
                            setOtherDeleteIndex(null);
                        }}
                        onConfirm={async () => {
                            setShowOtherRemoveConfirm(false);
                            const current = parseAttachedFiles(formData.otherUrl, "Other Document");
                            const updated = current.filter((_, i) => i !== otherDeleteIndex);
                            const newUrlStr = updated.length === 0 ? "" : JSON.stringify(updated);
                            const updatedFormData = {
                                ...formData,
                                otherUrl: newUrlStr,
                                otherDate: updated.length === 0 ? "" : formData.otherDate
                            };
                            setOtherDeleteIndex(null);
                            setFormData(updatedFormData);
                            const saveRes = await updateAccount(account.id, updatedFormData);
                            if (saveRes.success) {
                                router.refresh();
                            } else {
                                console.error("Failed to save changes after document deletion:", saveRes.error);
                            }
                        }}
                        title="Remove Document"
                        description="Are you sure you want to remove this document? This action takes effect immediately."
                        confirmLabel="Remove"
                        cancelLabel="Cancel"
                        variant="danger"
                    />
                            </div>
                        )}

                        {activeTab === 'activity' && (
                            <div className="space-y-6">
                                {historyBriefSection}
                        {/* Activity Timeline Card */}
                        <div className="bg-white rounded-lg border border-gray-100 overflow-hidden mb-6">
                            <div className="px-6 pt-6 pb-5">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-5 h-5 rounded bg-blue-50 text-blue-500 flex items-center justify-center">
                                        <CheckSquare size={12} />
                                    </div>
                                    <span className="text-xs font-black text-blue-500 uppercase tracking-widest" style={{ fontFamily: 'var(--font-lato)' }}>Activity</span>
                                    <div className="h-px bg-gray-100 flex-1" />
                                </div>
                                <div>
                                    <ActivityTimeline activities={account.activities || []} entityId={account.id} entityType="account" />
                                </div>
                            </div>
                        </div>

                        {/* Comments Card (Leads-matching premium formatting) */}
                        <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                            <div className="px-6 pt-6 pb-5">
                                <div className="flex items-center gap-2 mb-4">
                                    <Clock size={14} className="text-blue-500" />
                                    <span className="text-xs font-black text-blue-500 uppercase tracking-widest" style={{ fontFamily: 'var(--font-lato)' }}>History</span>
                                    <div className="h-px bg-gray-100 flex-1" />
                                </div>

                                {/* Add new comment */}
                                <div className="mb-4">
                                    <RichTextEditor value={newNote} onChange={setNewNote} placeholder="Add a general note about this account..." minHeight="90px" />
                                    <div className="flex justify-end items-center gap-3 mt-2">
                                        {newNote.trim() && newNote !== '<br>' && newNote.replace(/<[^>]*>/g, '').trim() && (
                                            <button
                                                onClick={() => setNewNote('')}
                                                className="px-4 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-700 transition-all"
                                            >
                                                Cancel
                                            </button>
                                        )}
                                        <button
                                            onClick={handleAddNote}
                                            disabled={isSaving || !newNote.trim() || newNote === '<br>' || !newNote.replace(/<[^>]*>/g, '').trim()}
                                            className="px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2"
                                        >
                                            {isSaving ? "Posting..." : "Save Comment"}
                                        </button>
                                    </div>
                                </div>

                                <div className="h-px bg-gray-50 my-5" />

                                {/* Notes List */}
                                {notes.length > 0 && (
                                    <div className="relative pl-6 border-l border-blue-100 space-y-6 mt-2">
                                        {notes.map((note: any) => {
                                            return (
                                                <div key={note.id} className="relative group">
                                                    <div className="absolute -left-[29px] top-1.5 w-2 h-2 rounded-full bg-blue-400 border border-white"></div>
                                                    {editingNoteId === note.id ? (
                                                        <div className="pb-2 space-y-3">
                                                            <RichTextEditor value={editNoteContent} onChange={setEditNoteContent} placeholder="Edit comment..." minHeight="60px" />
                                                            <div className="flex justify-end gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { setEditingNoteId(null); setEditNoteContent(''); }}
                                                                    className="px-4 py-1.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                                                                >
                                                                    Cancel
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleUpdateNote(note.id)}
                                                                    className="px-4 py-1.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                                                                >
                                                                    Save
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div>
                                                            <div className="flex justify-between items-start mb-1">
                                                                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ fontFamily: 'var(--font-montserrat)' }}>
                                                                    <span className="text-sky-500 font-bold">
                                                                        {new Date(note.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()}
                                                                    </span>
                                                                    <span className="text-gray-400"> • </span>
                                                                    <span className="text-gray-900 font-bold">
                                                                        BY {note.author?.name || 'System'}
                                                                    </span>
                                                                </span>
                                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => guardEdit(() => { setEditingNoteId(note.id); setEditNoteContent(note.content); })}
                                                                        className="p-1.5 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all focus:outline-none"
                                                                        title="Edit comment"
                                                                    >
                                                                        <Edit size={13} />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setConfirmDeleteNote(note.id)}
                                                                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all focus:outline-none"
                                                                        title="Delete note"
                                                                    >
                                                                        <Trash2 size={13} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            <CollapsibleComment
                                                                content={note.content}
                                                                className="text-xs text-gray-600 mt-1 leading-relaxed max-w-full"
                                                                style={{ fontFamily: 'var(--font-lato)' }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ─── Timeline: System Information ─── */}
                        <SystemLogTimeline entityType="account" entityId={account.id} />

                                {/* ── TYPE HISTORY (moved from Deals to System Info inside Activity & History) ── */}
                                {account.typeHistory && account.typeHistory.length > 0 && (() => {
                                    const TRIGGER_LABELS: Record<string, string> = {
                                        manual: 'manual edit',
                                        opp_won: 'Opp Closed Won',
                                        assignments_ended: 'all assignments ended',
                                        lead_converted: 'Lead converted',
                                    };
                                    return (
                                        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mt-6">
                                            <div className="px-5 py-3 flex items-center gap-2 border-b border-gray-100">
                                                <svg className="h-3.5 w-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                                                <span className="text-xs font-black text-blue-500 uppercase tracking-widest" style={{ fontFamily: 'var(--font-lato)' }}>Type History</span>
                                                <span className="text-[10px] font-bold text-gray-400 ml-0.5">({account.typeHistory.length})</span>
                                            </div>
                                            <div className="divide-y divide-gray-50">
                                                {account.typeHistory.slice(0, 5).map((h: any) => (
                                                    <div key={h.id} className="px-5 py-2.5">
                                                        <div className="flex items-start justify-between gap-3 text-xs">
                                                            <div className="min-w-0 flex-1">
                                                                <span className="text-gray-500">
                                                                    {h.oldType ? (
                                                                        <><span className="font-semibold text-gray-700">{h.oldType}</span> → </>
                                                                    ) : (
                                                                        <span className="text-gray-400">Initial: </span>
                                                                    )}
                                                                    <span className="font-semibold text-blue-600">{h.newType}</span>
                                                                </span>
                                                                <p className="text-[11px] text-gray-400 mt-0.5">
                                                                    Trigger: <span className="italic">{TRIGGER_LABELS[h.trigger] || h.trigger}</span>
                                                                    {h.changedBy && <> · by {h.changedBy}</>}
                                                                </p>
                                                            </div>
                                                            <span className="text-[10px] text-gray-400 flex-shrink-0">
                                                                {new Date(h.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}


                        {/* Metadata Card */}
                        <div className="bg-white rounded-lg border border-gray-200 px-6 py-4">
                            <div className="grid grid-cols-2 gap-x-6">
                                <div>
                                    <dt className="text-[11px] font-black text-gray-400 uppercase tracking-widest" style={{ fontFamily: 'var(--font-lato)' }}>Created By</dt>
                                    <dd className="mt-1 text-sm text-gray-900">{account.owner?.name || 'System'}, {new Date(account.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}</dd>
                                </div>
                                <div>
                                    <dt className="text-[11px] font-black text-gray-400 uppercase tracking-widest" style={{ fontFamily: 'var(--font-lato)' }}>Last Modified By</dt>
                                    <dd className="mt-1 text-sm text-gray-900">{account.lastModifiedBy || 'System'}, {new Date(account.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}</dd>
                                </div>
                            </div>
                        </div>
                    </div>
                        )}
                    </div>

                    {/* Right Sidebar: AI Account Resume (hidden on Activity & Contacts tabs, matches Leads) */}
                    {!['activity', 'contacts'].includes(activeTab) && (
                        <div className="space-y-6">
                            {aiResumeWidget}
                        </div>
                    )}
                </div>

            </div>
            <EditLockModal
                editors={lockEditors}
                recordLabel="account"
                onEditAnyway={() => { const open = pendingEditOpen; setLockEditors(null); setPendingEditOpen(null); open?.(); }}
                onCancel={() => { setLockEditors(null); setPendingEditOpen(null); if (!isEditingAnything) releaseEditLock(); }}
            />
<DeleteReasonModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDelete}
                title="Delete Account"
                description="Are you sure you want to delete this account? It will be moved to archives."
                isLoading={isDeleting}
                entityType="account"
            />

            <ConfirmModal
                isOpen={notifyModal.open}
                onClose={() => setNotifyModal(m => ({ ...m, open: false }))}
                onConfirm={() => setNotifyModal(m => ({ ...m, open: false }))}
                title={notifyModal.title}
                description={notifyModal.description}
                confirmLabel="OK"
                cancelLabel=""
                variant={notifyModal.variant}
            />

            <ConfirmModal
                isOpen={confirmDeleteNote !== null}
                onClose={() => setConfirmDeleteNote(null)}
                onConfirm={async () => {
                    if (confirmDeleteNote !== null) await handleDeleteNote(confirmDeleteNote);
                    setConfirmDeleteNote(null);
                }}
                title="Delete comment"
                description="Are you sure you want to delete this comment? This action cannot be undone."
                confirmLabel="Delete"
                cancelLabel="Cancel"
                variant="danger"
            />
        </div>
    );
}

