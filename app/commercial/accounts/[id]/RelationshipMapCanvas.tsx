'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    Handle,
    Position,
    MarkerType,
    NodeProps,
    Node,
    Edge,
    EdgeProps,
    Connection,
    BaseEdge,
    EdgeLabelRenderer,
    getSmoothStepPath,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Network, User, Plus, X, Shield, Sparkles, AlertCircle, RefreshCw, ZoomIn, ArrowRight, MessageSquare, Clock, Map as MapIcon, Lock, Unlock, PanelRightClose, PanelRightOpen, ChevronLeft, Trash2, Edit } from 'lucide-react';
import Link from 'next/link';
import RichTextEditor from '@/app/components/ui/RichTextEditor';
import CollapsibleComment from '@/app/components/ui/CollapsibleComment';
import { updateContact } from '@/app/actions/commercial/contact';
import { createRelationship, deleteRelationship } from '@/app/actions/commercial/relationship';
import { createNote, updateNote, deleteNote } from '@/app/actions/commercial/note';

// Buyer role color tokens
const BUYER_ROLE_COLORS: Record<string, { bg: string; text: string; border: string; bar: string; label: string }> = {
    champion: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', bar: 'bg-amber-500', label: '🏆 Champion' },
    influencer: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', bar: 'bg-purple-500', label: '🗣️ Influencer' },
    key_decision_maker: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', bar: 'bg-emerald-500', label: '✍️ Decision Maker' },
    blocker: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', bar: 'bg-rose-500', label: '🛑 Blocker' },
};

// Toolbar preferences (mini map / lock) persisted per browser
const MAP_PREFS_KEY = 'mycompany.relationshipMap.prefs';

// Relationship types where direction is meaningless (peer links) — drawn without an arrowhead
const SYMMETRIC_TYPES = new Set(['works_with']);

// Edge type styles
const EDGE_STYLES: Record<string, { color: string; dash?: string; label: string }> = {
    reports_to: { color: '#3b82f6', label: 'Reports To' },
    dotted_line: { color: '#64748b', dash: '5,5', label: 'Dotted Line' },
    influences: { color: '#a855f7', dash: '4,4', label: 'Influences' },
    blocks: { color: '#ef4444', label: 'Blocks' },
    works_with: { color: '#10b981', label: 'Works With' },
    mentor: { color: '#f59e0b', dash: '3,3', label: 'Mentor' },
};

// Compact date format for org chart cards: 25/AUG
function formatShortDate(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
    return `${day}/${month}`;
}

interface ContactNodeData extends Record<string, unknown> {
    contact: any;
    onUpdateRole: (contactId: number, newRole: string) => void;
    onUnlink: (contactId: number) => void;
    onOpenNotes: (contact: any) => void;
}

// Custom Node Component
function ContactCardNode({ data }: NodeProps<Node<ContactNodeData>>) {
    const contact = data.contact;
    const initials = (contact.fullName || '??')
        .split(' ')
        .map((n: string) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

    const roleStyle = BUYER_ROLE_COLORS[contact.buyerRole || ''] || {
        bg: 'bg-gray-50',
        text: 'text-gray-600',
        border: 'border-gray-200',
        bar: 'bg-gray-300',
        label: 'No Role Set',
    };

    // Last note/comment drives the freshness dot + the "last touch" chip
    const latestNote = (contact.notes || [])[0];
    let dotColor = 'bg-gray-300';
    let lastNoteText = 'No notes';
    let lastNoteTitle = 'No notes logged for this contact yet — click to add';

    if (latestNote) {
        const noteDate = new Date(latestNote.createdAt);
        const diffDays = (Date.now() - noteDate.getTime()) / (1000 * 60 * 60 * 24);
        lastNoteText = formatShortDate(noteDate);
        lastNoteTitle = `Last note added ${Math.max(0, Math.floor(diffDays))}d ago (${noteDate.toLocaleDateString()}) — click to view & edit`;

        if (diffDays <= 14) {
            dotColor = 'bg-emerald-500 ring-2 ring-emerald-100 animate-pulse';
        } else if (diffDays <= 60) {
            dotColor = 'bg-amber-500 ring-2 ring-amber-100';
        } else {
            dotColor = 'bg-gray-400';
        }
    }

    // Scheduled (not yet completed) follow-up
    const hasFollowUp = contact.dueDate && !contact.dueDateCompleted;
    const followUpDate = hasFollowUp ? new Date(contact.dueDate) : null;
    const isFollowUpOverdue = followUpDate ? followUpDate.getTime() < Date.now() : false;

    return (
        <div className="w-40 bg-white rounded-xl border border-gray-200/80 shadow-sm hover:shadow-md transition-all overflow-hidden relative group">
            {/* Hierarchy handles (blue, vertical): manager on top, reports below */}
            <Handle id="top" type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-blue-500 !border-2 !border-white hover:!scale-125 transition-all" />

            {/* Peer handles (green, horizontal): quick "Works With" links between equals */}
            <Handle id="peer-left-target" type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-emerald-500 !border-2 !border-white hover:!scale-150 transition-all" />
            <Handle id="peer-left" type="source" position={Position.Left} className="!w-2.5 !h-2.5 !bg-emerald-500 !border-2 !border-white hover:!scale-150 transition-all" />
            <Handle id="peer-right-target" type="target" position={Position.Right} className="!w-2.5 !h-2.5 !bg-emerald-500 !border-2 !border-white hover:!scale-150 transition-all" />
            <Handle id="peer-right" type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-emerald-500 !border-2 !border-white hover:!scale-150 transition-all" />

            {/* Accent top color bar */}
            <div className={`h-1 w-full ${roleStyle.bar}`} />

            {/* Unmap button (top-right corner) */}
            <button
                type="button"
                onClick={() => data.onUnlink(contact.id)}
                title="Unmap / Remove from canvas"
                className="absolute top-1.5 right-1.5 z-10 text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-full w-4 h-4 flex items-center justify-center transition-colors"
            >
                <X size={9} strokeWidth={3} />
            </button>

            <div className="p-2 flex flex-col items-center text-center">
                {/* Avatar */}
                <div className="mb-1">
                    <div className="w-7 h-7 rounded-full bg-blue-50 border border-blue-100 text-blue-600 font-extrabold text-[9px] flex items-center justify-center uppercase tracking-wider shadow-inner">
                        {initials}
                    </div>
                </div>

                {/* Name & Title */}
                <Link
                    href={`/commercial/contacts/${contact.id}`}
                    target="_blank"
                    className="text-[11px] font-bold text-gray-900 hover:text-blue-600 transition-colors truncate max-w-full block leading-tight"
                    style={{ fontFamily: 'var(--font-montserrat)' }}
                >
                    {contact.fullName}
                </Link>
                <p className="text-[9px] text-gray-500 truncate max-w-full font-medium leading-tight" style={{ fontFamily: 'var(--font-lato)' }}>
                    {contact.title || 'No Title'}
                </p>

                {/* Buyer Role Selector */}
                <div className="mt-1.5 w-full">
                    <select
                        value={contact.buyerRole || ''}
                        onChange={(e) => data.onUpdateRole(contact.id, e.target.value)}
                        className={`w-full text-[9px] font-bold rounded-md px-1 py-0.5 outline-none border cursor-pointer transition-all text-center ${roleStyle.bg} ${roleStyle.text} ${roleStyle.border}`}
                        style={{ textAlignLast: 'center' }}
                    >
                        <option value="">-- Set Role --</option>
                        <option value="champion">🏆 Champion</option>
                        <option value="influencer">🗣️ Influencer</option>
                        <option value="key_decision_maker">✍️ Key Decision Maker</option>
                        <option value="blocker">🛑 Blocker</option>
                    </select>
                </div>

                {/* Footer details & unmap button */}
                <div className="mt-1.5 w-full pt-1 border-t border-gray-100 flex items-center justify-center gap-2 text-[8px] font-bold">
                    {/* Last note/comment - clickable to open notes modal */}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            data.onOpenNotes(contact);
                        }}
                        className="flex items-center gap-0.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 px-1 py-0.5 rounded transition-all cursor-pointer font-bold text-[8px]"
                        title={lastNoteTitle}
                    >
                        <MessageSquare size={8} strokeWidth={2.5} className="text-blue-500" />
                        <span>{lastNoteText}</span>
                    </button>

                    {/* Scheduled follow-up */}
                    {followUpDate && (
                        <span
                            className={`flex items-center gap-0.5 ${isFollowUpOverdue ? 'text-rose-500' : 'text-blue-600'}`}
                            title={`${isFollowUpOverdue ? 'Overdue follow-up' : 'Follow-up scheduled'}: ${followUpDate.toLocaleDateString()}`}
                        >
                            <Clock size={8} strokeWidth={2.5} />
                            {formatShortDate(followUpDate)}
                        </span>
                    )}
                </div>
            </div>

            {/* Bottom handle: outgoing hierarchy (this contact manages the one below) */}
            <Handle id="bottom" type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-blue-500 !border-2 !border-white hover:!scale-125 transition-all" />
        </div>
    );
}

const nodeTypes = {
    contactNode: ContactCardNode,
};

// Custom Edge: renders the relationship label plus a hover-revealed delete button
function DeletableEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    markerEnd,
    data,
}: EdgeProps) {
    const [edgePath, defaultLabelX, defaultLabelY] = getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    // For top-down hierarchy links, place the "Manages" tag directly above the report card
    const isHierarchy = sourcePosition === Position.Bottom && targetPosition === Position.Top;
    const labelX = isHierarchy ? targetX : defaultLabelX;
    const labelY = isHierarchy ? targetY - 22 : defaultLabelY;

    const label = (data?.label as string) || '';
    const onDelete = data?.onDelete as ((edgeId: string) => void) | undefined;

    return (
        <>
            <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
            <EdgeLabelRenderer>
                <div
                    style={{
                        position: 'absolute',
                        transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                        pointerEvents: 'all',
                    }}
                    className="nodrag nopan group/edge flex items-center justify-center gap-1 bg-white border border-gray-200/90 rounded-lg px-2 py-0.5 shadow-xs z-30"
                >
                    <span
                        className="text-[9px] font-medium text-gray-700 whitespace-nowrap text-center leading-tight"
                        style={{ fontFamily: 'var(--font-lato)' }}
                    >
                        {label}
                    </span>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete?.(id);
                        }}
                        title="Remove this connection"
                        className="opacity-0 group-hover/edge:opacity-100 transition-opacity text-gray-400 hover:text-red-600 bg-gray-100 hover:bg-red-50 rounded-full w-3.5 h-3.5 flex items-center justify-center text-[10px] font-bold leading-none ml-0.5"
                    >
                        ×
                    </button>
                </div>
            </EdgeLabelRenderer>
        </>
    );
}

const edgeTypes = {
    deletable: DeletableEdge,
};

interface RelationshipMapCanvasProps {
    account: any;
    contacts: any[];
    customRelationships: any[];
    onContactsChange: (updatedContacts: any[]) => void;
    onRelationshipsChange: (updatedRels: any[]) => void;
    onError: (msg: string) => void;
}

export default function RelationshipMapCanvas({
    account,
    contacts,
    customRelationships,
    onContactsChange,
    onRelationshipsChange,
    onError,
}: RelationshipMapCanvasProps) {
    const [pendingConnection, setPendingConnection] = useState<{ sourceId: number; targetId: number } | null>(null);
    const [selectedEdgeType, setSelectedEdgeType] = useState<string>('reports_to');
    const [relationshipLabel, setRelationshipLabel] = useState<string>('');
    const [isSaving, setIsSaving] = useState(false);
    const [showMiniMap, setShowMiniMap] = useState(false);
    const [isLocked, setIsLocked] = useState(false);
    const [showSidebar, setShowSidebar] = useState(true);
    const [prefsLoaded, setPrefsLoaded] = useState(false);

    // Restore toolbar preferences on mount. Read here (not in useState) because localStorage is
    // client-only — reading it during render would break SSR hydration.
    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(MAP_PREFS_KEY);
            if (raw) {
                const prefs = JSON.parse(raw);
                if (typeof prefs.showMiniMap === 'boolean') setShowMiniMap(prefs.showMiniMap);
                if (typeof prefs.isLocked === 'boolean') setIsLocked(prefs.isLocked);
                if (typeof prefs.showSidebar === 'boolean') setShowSidebar(prefs.showSidebar);
            }
        } catch {
            // Corrupt entry or storage unavailable (private mode) — fall back to defaults
        }
        setPrefsLoaded(true);
    }, []);

    // Persist on change, but only after the initial read so we never overwrite saved prefs with defaults
    useEffect(() => {
        if (!prefsLoaded) return;
        try {
            window.localStorage.setItem(MAP_PREFS_KEY, JSON.stringify({ showMiniMap, isLocked, showSidebar }));
        } catch {
            // Storage unavailable — preferences just won't persist
        }
    }, [showMiniMap, isLocked, showSidebar, prefsLoaded]);

    // Track which contacts are mapped onto the canvas
    const mappedContactIds = useMemo(() => {
        const ids = new Set<number>();
        contacts.forEach((c) => {
            if (c.reportsToId || c.reportsToId2 || c.reportsToId3 || c.reportsToId4 || c.reportsToId5 || c.orgX != null || c.orgY != null) {
                ids.add(c.id);
            }
            if (contacts.some((child) => child.reportsToId === c.id || child.reportsToId2 === c.id || child.reportsToId3 === c.id || child.reportsToId4 === c.id || child.reportsToId5 === c.id)) {
                ids.add(c.id);
            }
        });
        customRelationships.forEach((rel) => {
            ids.add(rel.fromContactId);
            ids.add(rel.toContactId);
        });
        // NOTE: no auto-seed here. A previous version force-added the KDM (or first
        // contact) whenever the map was empty. That made the KDM impossible to remove:
        // clicking × cleared their position, the map went empty, and the seed put the
        // KDM straight back (even across reloads). An empty map is a valid state — the
        // "Unmapped Contacts" sidebar is how contacts get placed onto the canvas.
        return ids;
    }, [contacts, customRelationships]);

    const mappedContacts = useMemo(() => contacts.filter((c) => mappedContactIds.has(c.id)), [contacts, mappedContactIds]);
    const unmappedContacts = useMemo(() => contacts.filter((c) => !mappedContactIds.has(c.id)), [contacts, mappedContactIds]);

    // Role Update Handler
    const handleUpdateRole = useCallback(
        async (contactId: number, newRole: string) => {
            const updated = contacts.map((c) => (c.id === contactId ? { ...c, buyerRole: newRole || null, isKdm: newRole === 'key_decision_maker' } : c));
            onContactsChange(updated);

            const res = await updateContact(contactId, { buyerRole: newRole || '', isKdm: newRole === 'key_decision_maker' });
            if (!res.success) {
                onError(res.error || 'Failed to update buyer role');
                onContactsChange(contacts); // Revert
            }
        },
        [contacts, onContactsChange, onError]
    );

    // Unlink / Remove contact from canvas.
    // A contact counts as "mapped" if it has a position, its own hierarchy link,
    // someone reporting TO it, or ANY custom relationship touching it. So a real
    // "remove from canvas" must clear all four — otherwise the card can't be
    // removed (e.g. a "Works With" peer link, or a subordinate, keeps it pinned).
    const handleUnlinkContact = useCallback(
        async (contactId: number) => {
            const prevContacts = contacts;
            const prevRels = customRelationships;

            const pointsToRemoved = (c: any) =>
                c.reportsToId === contactId || c.reportsToId2 === contactId ||
                c.reportsToId3 === contactId || c.reportsToId4 === contactId ||
                c.reportsToId5 === contactId;

            // Optimistic local update: clear the contact's own position + hierarchy,
            // clear any reverse-hierarchy slots on OTHER contacts pointing to it,
            // and drop every custom relationship that touches it.
            const updatedContacts = contacts.map((c) => {
                if (c.id === contactId) {
                    return { ...c, reportsToId: null, reportsToId2: null, reportsToId3: null, reportsToId4: null, reportsToId5: null, orgX: null, orgY: null };
                }
                if (pointsToRemoved(c)) {
                    return {
                        ...c,
                        reportsToId: c.reportsToId === contactId ? null : c.reportsToId,
                        reportsToId2: c.reportsToId2 === contactId ? null : c.reportsToId2,
                        reportsToId3: c.reportsToId3 === contactId ? null : c.reportsToId3,
                        reportsToId4: c.reportsToId4 === contactId ? null : c.reportsToId4,
                        reportsToId5: c.reportsToId5 === contactId ? null : c.reportsToId5,
                    };
                }
                return c;
            });

            const relsToDelete = customRelationships.filter((r) => r.fromContactId === contactId || r.toContactId === contactId);
            const remainingRels = customRelationships.filter((r) => r.fromContactId !== contactId && r.toContactId !== contactId);

            onContactsChange(updatedContacts);
            onRelationshipsChange(remainingRels);

            // Persist: 1) clear the contact's own fields
            const res = await updateContact(contactId, {
                reportsToId: '', reportsToId2: '', reportsToId3: '', reportsToId4: '', reportsToId5: '', orgX: null, orgY: null,
            });
            if (!res.success) {
                onError(res.error || 'Failed to unmap contact');
                onContactsChange(prevContacts);
                onRelationshipsChange(prevRels);
                return;
            }

            // 2) clear reverse-hierarchy references on other contacts
            for (const c of prevContacts) {
                if (c.id === contactId || !pointsToRemoved(c)) continue;
                const payload: any = {};
                if (c.reportsToId === contactId) payload.reportsToId = '';
                if (c.reportsToId2 === contactId) payload.reportsToId2 = '';
                if (c.reportsToId3 === contactId) payload.reportsToId3 = '';
                if (c.reportsToId4 === contactId) payload.reportsToId4 = '';
                if (c.reportsToId5 === contactId) payload.reportsToId5 = '';
                await updateContact(c.id, payload);
            }

            // 3) delete custom relationships touching this contact
            for (const r of relsToDelete) {
                await deleteRelationship(r.id, account.id);
            }
        },
        [contacts, customRelationships, onContactsChange, onRelationshipsChange, onError, account]
    );

    // Notes Modal State for Contacts on Canvas
    const [notesModalContact, setNotesModalContact] = useState<any | null>(null);
    const [newNoteContent, setNewNoteContent] = useState<string>('');
    const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
    const [editNoteContent, setEditNoteContent] = useState<string>('');
    const [isSubmittingNote, setIsSubmittingNote] = useState<boolean>(false);

    const handleOpenNotes = useCallback((contact: any) => {
        setNotesModalContact(contact);
        setNewNoteContent('');
        setEditingNoteId(null);
        setEditNoteContent('');
    }, []);

    const handleAddMapNote = async () => {
        if (!notesModalContact) return;
        const cleanText = newNoteContent.replace(/<[^>]*>/g, '').trim();
        if (!cleanText) return;

        setIsSubmittingNote(true);
        const res = await createNote({ content: newNoteContent, contactId: notesModalContact.id });
        if (res.success && res.data) {
            const updatedNotes = [res.data, ...(notesModalContact.notes || [])];
            const updatedContact = { ...notesModalContact, notes: updatedNotes };
            setNotesModalContact(updatedContact);
            setNewNoteContent('');

            // Update parent contacts state
            const updatedContacts = contacts.map((c) => (c.id === notesModalContact.id ? updatedContact : c));
            onContactsChange(updatedContacts);
        } else {
            onError(`Failed to add note: ${res.error || 'Unknown error'}`);
        }
        setIsSubmittingNote(false);
    };

    const handleUpdateMapNote = async (noteId: number) => {
        if (!notesModalContact) return;
        const cleanText = editNoteContent.replace(/<[^>]*>/g, '').trim();
        if (!cleanText) return;

        setIsSubmittingNote(true);
        const res = await updateNote({ id: noteId, content: editNoteContent, contactId: notesModalContact.id });
        if (res.success && res.data) {
            const updatedNotes = (notesModalContact.notes || []).map((n: any) =>
                n.id === noteId ? { ...n, content: res.data.content, updatedAt: res.data.updatedAt } : n
            );
            const updatedContact = { ...notesModalContact, notes: updatedNotes };
            setNotesModalContact(updatedContact);
            setEditingNoteId(null);
            setEditNoteContent('');

            // Update parent contacts state
            const updatedContacts = contacts.map((c) => (c.id === notesModalContact.id ? updatedContact : c));
            onContactsChange(updatedContacts);
        } else {
            onError(`Failed to update note: ${res.error || 'Unknown error'}`);
        }
        setIsSubmittingNote(false);
    };

    const handleDeleteMapNote = async (noteId: number) => {
        if (!notesModalContact) return;

        const res = await deleteNote({ id: noteId, contactId: notesModalContact.id });
        if (res.success) {
            const updatedNotes = (notesModalContact.notes || []).filter((n: any) => n.id !== noteId);
            const updatedContact = { ...notesModalContact, notes: updatedNotes };
            setNotesModalContact(updatedContact);

            // Update parent contacts state
            const updatedContacts = contacts.map((c) => (c.id === notesModalContact.id ? updatedContact : c));
            onContactsChange(updatedContacts);
        } else {
            onError(`Failed to delete note: ${res.error || 'Unknown error'}`);
        }
    };

    // Helper to calculate hierarchy level for fallback positioning when orgX/orgY are null
    const getContactLevel = (contact: any, contactsList: any[], visited = new Set<number>()): number => {
        if (visited.has(contact.id)) return 0;
        visited.add(contact.id);
        const mgrId = contact.reportsToId || contact.reportsToId2 || contact.reportsToId3 || contact.reportsToId4 || contact.reportsToId5;
        if (!mgrId) return 0;
        const manager = contactsList.find((m: any) => m.id === mgrId);
        if (!manager) return 0;
        return 1 + getContactLevel(manager, contactsList, visited);
    };

    // Build React Flow Nodes
    const initialNodes = useMemo(() => {
        return mappedContacts.map((c, idx) => {
            const level = getContactLevel(c, mappedContacts);
            const mgrId = c.reportsToId || c.reportsToId2 || c.reportsToId3 || c.reportsToId4 || c.reportsToId5;
            const manager = mgrId ? mappedContacts.find((m) => m.id === mgrId) : null;

            const defaultY = manager && manager.orgY != null ? manager.orgY + 210 : level * 210 + 60;
            const defaultX = manager && manager.orgX != null ? manager.orgX : (idx % 4) * 260 + 80;

            const posX = c.orgX != null ? c.orgX : defaultX;
            const posY = c.orgY != null ? c.orgY : defaultY;

            return {
                id: String(c.id),
                type: 'contactNode',
                position: { x: posX, y: posY },
                data: {
                    contact: c,
                    onUpdateRole: handleUpdateRole,
                    onUnlink: handleUnlinkContact,
                    onOpenNotes: handleOpenNotes,
                },
            };
        });
    }, [mappedContacts, handleUpdateRole, handleUnlinkContact, handleOpenNotes]);

    // Delete a connection: clears matching reportsToId field for hierarchy edges, removes row for custom ones
    const handleDeleteEdgeById = useCallback(
        async (edgeId: string) => {
            if (edgeId.startsWith('reports-')) {
                // id shape: reports-{childId}-{managerId}
                const parts = edgeId.split('-');
                const childId = parseInt(parts[1]);
                const managerId = parseInt(parts[2]);
                if (!childId || !managerId) return;

                const targetContact = contacts.find((c) => c.id === childId);
                if (!targetContact) return;

                const payload: any = {};
                if (targetContact.reportsToId === managerId) payload.reportsToId = '';
                else if (targetContact.reportsToId2 === managerId) payload.reportsToId2 = '';
                else if (targetContact.reportsToId3 === managerId) payload.reportsToId3 = '';
                else if (targetContact.reportsToId4 === managerId) payload.reportsToId4 = '';
                else if (targetContact.reportsToId5 === managerId) payload.reportsToId5 = '';

                const prevContacts = contacts;
                onContactsChange(contacts.map((c) => (c.id === childId ? {
                    ...c,
                    reportsToId: c.reportsToId === managerId ? null : c.reportsToId,
                    reportsToId2: c.reportsToId2 === managerId ? null : c.reportsToId2,
                    reportsToId3: c.reportsToId3 === managerId ? null : c.reportsToId3,
                    reportsToId4: c.reportsToId4 === managerId ? null : c.reportsToId4,
                    reportsToId5: c.reportsToId5 === managerId ? null : c.reportsToId5,
                } : c)));

                const res = await updateContact(childId, payload);
                if (!res.success) {
                    onError(res.error || 'Failed to remove reporting relationship.');
                    onContactsChange(prevContacts); // Revert
                }
            } else if (edgeId.startsWith('rel-')) {
                const relId = parseInt(edgeId.slice(4));
                if (!relId) return;

                const prevRels = customRelationships;
                onRelationshipsChange(customRelationships.filter((r) => r.id !== relId));

                const res = await deleteRelationship(relId, account.id);
                if (!res.success) {
                    onError(res.error || 'Failed to remove relationship.');
                    onRelationshipsChange(prevRels); // Revert
                }
            }
        },
        [contacts, customRelationships, onContactsChange, onRelationshipsChange, onError, account]
    );

    // Keyboard deletion (select an edge + Delete/Backspace)
    const handleEdgesDelete = useCallback(
        (deleted: Edge[]) => {
            deleted.forEach((e) => handleDeleteEdgeById(e.id));
        },
        [handleDeleteEdgeById]
    );

    // Deleting a node on the canvas unmaps that contact (persisted, not just visual)
    const handleNodesDelete = useCallback(
        (deleted: Node[]) => {
            deleted.forEach((n) => handleUnlinkContact(parseInt(n.id)));
        },
        [handleUnlinkContact]
    );

    // Build React Flow Edges
    const initialEdges = useMemo(() => {
        const edges: Edge[] = [];

        // 1. Hierarchy Edges (reportsToId, reportsToId2..5)
        mappedContacts.forEach((c) => {
            const managerIds = [c.reportsToId, c.reportsToId2, c.reportsToId3, c.reportsToId4, c.reportsToId5].filter(Boolean) as number[];
            managerIds.forEach((mId) => {
                if (mId && mappedContactIds.has(mId)) {
                    edges.push({
                        id: `reports-${c.id}-${mId}`,
                        source: String(mId),
                        target: String(c.id),
                        sourceHandle: 'bottom',
                        targetHandle: 'top',
                        type: 'deletable',
                        animated: false,
                        style: { stroke: EDGE_STYLES.reports_to.color, strokeWidth: 2 },
                        markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_STYLES.reports_to.color },
                        data: {
                            // Arrow points top-down (manager → report), so the label must read in that
                            // direction. "Reports To" would read backwards on a downward arrow.
                            label: 'Manages',
                            color: EDGE_STYLES.reports_to.color,
                            onDelete: handleDeleteEdgeById,
                        },
                    });
                }
            });
        });

        // 2. Custom Typed Relationship Edges
        customRelationships.forEach((rel) => {
            if (mappedContactIds.has(rel.fromContactId) && mappedContactIds.has(rel.toContactId)) {
                const styleConfig = EDGE_STYLES[rel.type] || { color: '#64748b', label: rel.type };

                // Attach peer links to whichever side faces the other card, so the line takes the short path
                const fromX = mappedContacts.find((c) => c.id === rel.fromContactId)?.orgX ?? 0;
                const toX = mappedContacts.find((c) => c.id === rel.toContactId)?.orgX ?? 0;
                const targetIsRight = toX >= fromX;

                edges.push({
                    id: `rel-${rel.id}`,
                    source: String(rel.fromContactId),
                    target: String(rel.toContactId),
                    sourceHandle: targetIsRight ? 'peer-right' : 'peer-left',
                    targetHandle: targetIsRight ? 'peer-left-target' : 'peer-right-target',
                    type: 'deletable',
                    style: {
                        stroke: styleConfig.color,
                        strokeWidth: 2,
                        strokeDasharray: styleConfig.dash,
                    },
                    // Peer links (e.g. Works With) are symmetric — no arrowhead
                    markerEnd: SYMMETRIC_TYPES.has(rel.type)
                        ? undefined
                        : { type: MarkerType.ArrowClosed, color: styleConfig.color },
                    data: {
                        label: rel.label || styleConfig.label,
                        color: styleConfig.color,
                        onDelete: handleDeleteEdgeById,
                    },
                });
            }
        });

        return edges;
    }, [mappedContacts, mappedContactIds, customRelationships, handleDeleteEdgeById]);

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    useEffect(() => {
        setNodes(initialNodes);
    }, [initialNodes, setNodes]);

    useEffect(() => {
        setEdges(initialEdges);
    }, [initialEdges, setEdges]);

    // Handle Node Drag Stop: Persist position (debounced)
    const handleNodeDragStop = useCallback(
        async (_event: any, node: Node) => {
            const contactId = parseInt(node.id);
            const x = Math.round(node.position.x);
            const y = Math.round(node.position.y);

            const updated = contacts.map((c) => (c.id === contactId ? { ...c, orgX: x, orgY: y } : c));
            onContactsChange(updated);

            await updateContact(contactId, { orgX: x, orgY: y });
        },
        [contacts, onContactsChange]
    );

    // Handle Connecting Two Handles
    const handleConnect = useCallback((connection: Connection) => {
        if (!connection.source || !connection.target) return;
        const sourceId = parseInt(connection.source);
        const targetId = parseInt(connection.target);

        // Dragging from a side (green) handle means "peer" — preselect Works With.
        // Top/bottom (blue) handles mean hierarchy — preselect Reports To.
        const usedPeerHandle =
            (connection.sourceHandle || '').startsWith('peer') ||
            (connection.targetHandle || '').startsWith('peer');
        setSelectedEdgeType(usedPeerHandle ? 'works_with' : 'reports_to');

        setPendingConnection({ sourceId, targetId });
    }, []);

    // Create edge based on user choice in connection modal
    const handleConfirmConnection = async () => {
        if (!pendingConnection) return;
        setIsSaving(true);

        const { sourceId, targetId } = pendingConnection;

        if (selectedEdgeType === 'reports_to') {
            // Set Hierarchy: targetId reports to sourceId
            const sourceContact = contacts.find((c) => c.id === sourceId);
            const targetContact = contacts.find((c) => c.id === targetId);
            if (!targetContact) {
                setIsSaving(false);
                setPendingConnection(null);
                return;
            }

            // Check if relationship already exists
            if (
                targetContact.reportsToId === sourceId ||
                targetContact.reportsToId2 === sourceId ||
                targetContact.reportsToId3 === sourceId ||
                targetContact.reportsToId4 === sourceId ||
                targetContact.reportsToId5 === sourceId
            ) {
                setPendingConnection(null);
                setIsSaving(false);
                return;
            }

            // Find next open slot
            let slot = 'reportsToId';
            if (!targetContact.reportsToId) slot = 'reportsToId';
            else if (!targetContact.reportsToId2) slot = 'reportsToId2';
            else if (!targetContact.reportsToId3) slot = 'reportsToId3';
            else if (!targetContact.reportsToId4) slot = 'reportsToId4';
            else if (!targetContact.reportsToId5) slot = 'reportsToId5';
            else {
                onError('Contact already has maximum 5 superiors.');
                setPendingConnection(null);
                setIsSaving(false);
                return;
            }

            // Auto-position target under source manager if target is above or has no position
            const mgrX = sourceContact?.orgX ?? 260;
            const mgrY = sourceContact?.orgY ?? 60;
            const newTargetX = targetContact.orgX != null && targetContact.orgY != null && targetContact.orgY > mgrY ? targetContact.orgX : mgrX;
            const newTargetY = targetContact.orgY != null && targetContact.orgY > mgrY ? targetContact.orgY : mgrY + 210;

            const updated = contacts.map((c) => (c.id === targetId ? { ...c, [slot]: sourceId, orgX: newTargetX, orgY: newTargetY } : c));
            onContactsChange(updated);

            const res = await updateContact(targetId, { [slot]: String(sourceId), orgX: newTargetX, orgY: newTargetY });
            if (!res.success) {
                onError(res.error || 'Failed to update hierarchy relationship.');
                onContactsChange(contacts); // Revert
            }
        } else {
            // Create Custom Typed Relationship in ContactRelationship
            const res = await createRelationship({
                fromContactId: sourceId,
                toContactId: targetId,
                type: selectedEdgeType,
                label: relationshipLabel.trim() || undefined,
                accountId: account.id,
            });

            if (res.success && res.data) {
                onRelationshipsChange([...customRelationships, res.data]);
            } else {
                onError(res.error || 'Failed to create relationship.');
            }
        }

        setIsSaving(false);
        setPendingConnection(null);
        setRelationshipLabel('');
    };

    // Auto-arrange tree algorithm
    const handleAutoArrange = async () => {
        const rootContacts = mappedContacts.filter((c) => !c.reportsToId && !c.reportsToId2 && !c.reportsToId3 && !c.reportsToId4 && !c.reportsToId5);
        const newContacts = [...contacts];

        const positionTree = (nodeId: number, level: number, leftOffset: number): number => {
            const children = mappedContacts.filter((c) => c.reportsToId === nodeId || c.reportsToId2 === nodeId || c.reportsToId3 === nodeId || c.reportsToId4 === nodeId || c.reportsToId5 === nodeId);
            let currentX = leftOffset;

            if (children.length === 0) {
                const idx = newContacts.findIndex((c) => c.id === nodeId);
                if (idx !== -1) {
                    newContacts[idx] = { ...newContacts[idx], orgX: leftOffset, orgY: level * 210 + 60 };
                }
                return leftOffset + 260;
            }

            children.forEach((child) => {
                currentX = positionTree(child.id, level + 1, currentX);
            });

            const firstChild = newContacts.find((c) => c.id === children[0].id);
            const lastChild = newContacts.find((c) => c.id === children[children.length - 1].id);
            const midX = firstChild && lastChild && firstChild.orgX != null && lastChild.orgX != null
                ? (firstChild.orgX + lastChild.orgX) / 2
                : leftOffset;

            const idx = newContacts.findIndex((c) => c.id === nodeId);
            if (idx !== -1) {
                newContacts[idx] = { ...newContacts[idx], orgX: midX, orgY: level * 210 + 60 };
            }

            return currentX;
        };

        let xAcc = 80;
        rootContacts.forEach((root) => {
            xAcc = positionTree(root.id, 0, xAcc) + 80;
        });

        onContactsChange(newContacts);

        // Save positions in background
        await Promise.all(
            newContacts
                .filter((c) => mappedContactIds.has(c.id))
                .map((c) => updateContact(c.id, { orgX: c.orgX, orgY: c.orgY }))
        );
    };

    // Add unmapped contact to canvas
    const handleAddUnmappedToCanvas = async (contactId: number) => {
        const nextX = 80 + (mappedContacts.length % 4) * 260;
        const nextY = 60 + Math.floor(mappedContacts.length / 4) * 210;

        const updated = contacts.map((c) => (c.id === contactId ? { ...c, orgX: nextX, orgY: nextY } : c));
        onContactsChange(updated);

        await updateContact(contactId, { orgX: nextX, orgY: nextY });
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6 h-[650px] w-full relative">
            {/* Main React Flow Canvas */}
            <div className="flex-1 bg-slate-950/5 rounded-2xl border border-gray-200 overflow-hidden relative shadow-inner">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onEdgesDelete={handleEdgesDelete}
                    onNodesDelete={handleNodesDelete}
                    onConnect={handleConnect}
                    onNodeDragStop={handleNodeDragStop}
                    deleteKeyCode={['Delete', 'Backspace']}
                    nodesDraggable={!isLocked}
                    nodesConnectable={!isLocked}
                    elementsSelectable={!isLocked}
                    proOptions={{ hideAttribution: true }}
                    fitView
                    fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
                    minZoom={0.2}
                    maxZoom={1.5}
                >
                    <Background color="#cbd5e1" gap={20} size={1} />
                    {/* Interactivity toggle lives in the top toolbar instead */}
                    <Controls showInteractive={false} className="!bg-white !border-gray-200 !shadow-md !rounded-xl" />
                    {showMiniMap && (
                        <MiniMap
                            className="!bg-white/80 !border-gray-200 !rounded-xl !shadow-md"
                            nodeColor="#3b82f6"
                            maskColor="rgba(241, 245, 249, 0.7)"
                        />
                    )}
                </ReactFlow>

                {/* Canvas Toolbar */}
                <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-white/90 backdrop-blur-md p-1.5 rounded-xl border border-gray-200/80 shadow-sm">
                    <button
                        type="button"
                        onClick={handleAutoArrange}
                        className="flex items-center gap-1.5 text-xs font-bold text-gray-700 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-gray-200/60"
                        title="Tidy up the canvas: repositions every card into a clean top-down hierarchy, placing each manager centered above their direct reports."
                    >
                        <RefreshCw size={13} /> Tidy Layout
                    </button>

                    <button
                        type="button"
                        onClick={() => setShowMiniMap((v) => !v)}
                        className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors border ${
                            showMiniMap
                                ? 'text-blue-600 bg-blue-50 border-blue-200'
                                : 'text-gray-700 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 border-gray-200/60'
                        }`}
                        title={showMiniMap ? 'Hide the mini map' : 'Show the mini map — a small overview of the whole chart'}
                    >
                        <MapIcon size={13} /> {showMiniMap ? 'Hide Map' : 'Mini Map'}
                    </button>

                    <button
                        type="button"
                        onClick={() => setIsLocked((v) => !v)}
                        className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors border ${
                            isLocked
                                ? 'text-amber-700 bg-amber-50 border-amber-200'
                                : 'text-gray-700 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 border-gray-200/60'
                        }`}
                        title={
                            isLocked
                                ? 'Canvas locked — cards cannot be moved or connected. Click to unlock.'
                                : 'Lock the canvas so cards cannot be moved or connected by accident'
                        }
                    >
                        {isLocked ? <Lock size={13} /> : <Unlock size={13} />} {isLocked ? 'Locked' : 'Lock'}
                    </button>
                </div>

                {/* Floating button to re-open sidebar when collapsed */}
                {!showSidebar && (
                    <button
                        type="button"
                        onClick={() => setShowSidebar(true)}
                        className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-white/95 backdrop-blur-md hover:bg-white text-gray-800 hover:text-blue-600 px-3 py-2 rounded-xl border border-gray-200/90 shadow-md transition-all text-xs font-bold animate-in fade-in duration-200"
                        title="Show Unmapped Contacts sidebar"
                    >
                        <User size={13} className="text-blue-600" />
                        Unmapped Contacts ({unmappedContacts.length})
                        <ChevronLeft size={14} className="text-gray-400" />
                    </button>
                )}
            </div>

            {/* Sidebar: Unmapped Contacts Palette */}
            {showSidebar && (
                <div className="w-full lg:w-72 bg-white border border-gray-200 rounded-2xl p-4 flex flex-col h-full shadow-sm flex-shrink-0 animate-in fade-in slide-in-from-right-2 duration-200">
                    <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-gray-800 uppercase tracking-widest" style={{ fontFamily: 'var(--font-lato)' }}>
                                Unmapped Contacts
                            </span>
                            <span className="bg-blue-50 text-blue-600 text-xs font-bold px-2 py-0.5 rounded-full">
                                {unmappedContacts.length}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowSidebar(false)}
                            className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition-colors"
                            title="Hide sidebar to widen map view"
                        >
                            <PanelRightClose size={15} />
                        </button>
                    </div>

                    <p className="text-[11px] text-gray-400 font-medium mb-3 leading-relaxed">
                        Click <span className="text-blue-600 font-bold">+ Add</span> to put a contact on the canvas.
                        Drag the <span className="text-blue-600 font-bold">blue</span> dots (top/bottom) to set who reports to whom,
                        or the <span className="text-emerald-600 font-bold">green</span> dots (sides) to link peers.
                        To remove a connection, hover it and click <span className="text-gray-600 font-bold">×</span>.
                    </p>

                    {unmappedContacts.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-gray-200 bg-gray-50/50 rounded-xl">
                            <Sparkles className="h-6 w-6 text-emerald-500 mb-2" />
                            <p className="text-xs text-gray-600 font-bold">All Contacts Mapped!</p>
                            <p className="text-[10px] text-gray-400 mt-1">Every contact is now positioned on the canvas.</p>
                        </div>
                    ) : (
                        <div className="space-y-2.5 overflow-y-auto flex-1 pr-1.5 custom-scrollbar">
                            {unmappedContacts.map((contact) => (
                                <div
                                    key={contact.id}
                                    className="p-3 bg-gray-50/80 border border-gray-200/70 hover:border-blue-300 hover:bg-white rounded-xl transition-all shadow-2xs flex items-center justify-between gap-2"
                                >
                                    <div className="min-w-0 flex-1">
                                        <h6 className="text-xs font-bold text-gray-900 truncate" style={{ fontFamily: 'var(--font-montserrat)' }}>
                                            {contact.fullName}
                                        </h6>
                                        <p className="text-[10px] text-gray-500 truncate mt-0.5 font-medium">
                                            {contact.title || 'No Title'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleAddUnmappedToCanvas(contact.id)}
                                        className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1.5 rounded-lg transition-colors flex-shrink-0"
                                    >
                                        <Plus size={12} /> Add
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Modal for Selecting Edge Connection Type */}
            {pendingConnection && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4 animate-in fade-in duration-150">
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 max-w-sm w-full shadow-2xl space-y-4">
                        <div className="flex items-center gap-2 text-blue-600 font-bold text-sm">
                            <Network size={18} /> Link Contacts
                        </div>

                        {(() => {
                            const sourceName = contacts.find((c) => c.id === pendingConnection.sourceId)?.fullName || 'Contact';
                            const targetName = contacts.find((c) => c.id === pendingConnection.targetId)?.fullName || 'Contact';

                            return (
                                <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3 space-y-2">
                                    <p className="text-[10px] font-black text-blue-500 uppercase tracking-wider">
                                        This will save
                                    </p>
                                    {selectedEdgeType === 'reports_to' ? (
                                        <p className="text-xs text-gray-700 leading-relaxed">
                                            <span className="font-extrabold text-gray-900">{targetName}</span> reports to{' '}
                                            <span className="font-extrabold text-gray-900">{sourceName}</span>.
                                            <span className="block text-[10px] text-gray-500 mt-1">
                                                {sourceName} is the manager and will sit on top in the chart.
                                            </span>
                                        </p>
                                    ) : SYMMETRIC_TYPES.has(selectedEdgeType) ? (
                                        <p className="text-xs text-gray-700 leading-relaxed">
                                            <span className="font-extrabold text-gray-900">{sourceName}</span> works with{' '}
                                            <span className="font-extrabold text-gray-900">{targetName}</span>.
                                            <span className="block text-[10px] text-gray-500 mt-1">
                                                A peer link — same level, no hierarchy between them.
                                            </span>
                                        </p>
                                    ) : (
                                        <p className="text-xs text-gray-700 leading-relaxed">
                                            <span className="font-extrabold text-gray-900">{sourceName}</span>
                                            {' → '}
                                            <span className="font-extrabold text-gray-900">{targetName}</span>
                                        </p>
                                    )}

                                    {/* Direction only matters for asymmetric relationships */}
                                    {!SYMMETRIC_TYPES.has(selectedEdgeType) && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setPendingConnection({
                                                    sourceId: pendingConnection.targetId,
                                                    targetId: pendingConnection.sourceId,
                                                })
                                            }
                                            className="text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-white border border-blue-200 hover:border-blue-400 px-2 py-1 rounded-lg transition-colors"
                                        >
                                            ⇄ Swap direction
                                        </button>
                                    )}
                                </div>
                            );
                        })()}

                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                                Relationship Type
                            </label>
                            <select
                                value={selectedEdgeType}
                                onChange={(e) => setSelectedEdgeType(e.target.value)}
                                className="w-full text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-blue-500"
                            >
                                <option value="reports_to">📊 Reports To (Organizational Hierarchy)</option>
                                <option value="works_with">🟢 Works With (Peer Collaboration)</option>
                            </select>
                        </div>

                        {selectedEdgeType !== 'reports_to' && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                                    Custom Label (Optional)
                                </label>
                                <input
                                    type="text"
                                    value={relationshipLabel}
                                    onChange={(e) => setRelationshipLabel(e.target.value)}
                                    placeholder="e.g., Tech Advisor, Steering Comm"
                                    className="w-full text-xs bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-blue-500 font-medium"
                                />
                            </div>
                        )}

                        <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
                            <button
                                type="button"
                                onClick={() => setPendingConnection(null)}
                                className="text-xs font-bold text-gray-500 hover:text-gray-700 px-3 py-2 rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={isSaving}
                                onClick={handleConfirmConnection}
                                className="flex items-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl transition-colors shadow-sm"
                            >
                                {isSaving ? 'Linking...' : 'Save Relationship'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* ── NOTES MODAL FOR CONTACT ON MAP ── */}
            {notesModalContact && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
                        {/* Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-gray-100 shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 font-extrabold text-xs flex items-center justify-center border border-blue-100 uppercase tracking-wider">
                                    {(notesModalContact.fullName || '??').split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-900 font-montserrat">{notesModalContact.fullName}</h3>
                                    <p className="text-xs text-gray-500 font-lato">{notesModalContact.title || 'No Title'}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setNotesModalContact(null)}
                                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Content Body */}
                        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                            {/* New Note Form */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-montserrat block">Add New Note</label>
                                <RichTextEditor
                                    value={newNoteContent}
                                    onChange={setNewNoteContent}
                                    placeholder={`Add a note for ${notesModalContact.firstName || notesModalContact.fullName}...`}
                                    minHeight="70px"
                                />
                                <div className="flex justify-end gap-2 pt-1">
                                    <button
                                        type="button"
                                        disabled={isSubmittingNote || !newNoteContent.replace(/<[^>]*>/g, '').trim()}
                                        onClick={handleAddMapNote}
                                        className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                    >
                                        {isSubmittingNote ? 'Saving...' : 'Save Note'}
                                    </button>
                                </div>
                            </div>

                            <div className="h-px bg-gray-100 my-2" />

                            {/* Notes History */}
                            <div>
                                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-montserrat mb-3">Notes History ({notesModalContact.notes?.length || 0})</h4>
                                {notesModalContact.notes && notesModalContact.notes.length > 0 ? (
                                    <div className="relative pl-5 border-l border-blue-100 space-y-4">
                                        {notesModalContact.notes.map((note: any) => (
                                            <div key={note.id} className="relative group">
                                                <div className="absolute -left-[25px] top-1.5 w-2 h-2 rounded-full bg-blue-400 border border-white" />
                                                {editingNoteId === note.id ? (
                                                    <div className="space-y-2">
                                                        <RichTextEditor
                                                            value={editNoteContent}
                                                            onChange={setEditNoteContent}
                                                            placeholder="Edit note..."
                                                            minHeight="60px"
                                                        />
                                                        <div className="flex justify-end gap-2 pt-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => { setEditingNoteId(null); setEditNoteContent(''); }}
                                                                className="px-3 py-1 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={isSubmittingNote}
                                                                onClick={() => handleUpdateMapNote(note.id)}
                                                                className="px-3 py-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                                                            >
                                                                Save
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <div className="flex justify-between items-start mb-1">
                                                            <span className="text-[10px] font-bold uppercase tracking-wider font-montserrat">
                                                                <span className="text-sky-500">{new Date(note.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()}</span>
                                                                <span className="text-gray-300"> • </span>
                                                                <span className="text-gray-700">BY {note.author?.name || 'System'}</span>
                                                            </span>
                                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { setEditingNoteId(note.id); setEditNoteContent(note.content); }}
                                                                    className="p-1 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded transition-all"
                                                                    title="Edit note"
                                                                >
                                                                    <Edit size={12} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeleteMapNote(note.id)}
                                                                    className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-all"
                                                                    title="Delete note"
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <CollapsibleComment
                                                            content={note.content}
                                                            className="text-xs text-gray-600 leading-relaxed max-w-full"
                                                            style={{ fontFamily: 'var(--font-lato)' }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-400 italic">No notes logged for this contact yet.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
