"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Building2, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import ClickableRow from "@/app/components/ClickableRow";
import ExportToolbar from "@/app/components/ExportToolbar";
import ColumnSelector, { useColumnVisibility, ColumnDef } from "@/app/components/ColumnSelector";
import ConfirmModal from "@/app/components/modals/ConfirmModal";
import AlertModal from "@/app/components/modals/AlertModal";

// Deterministic avatar color palette based on name hash — using inline styles
// to guarantee rendering (Tailwind JIT can't detect dynamically-composed classes)
const AVATAR_COLORS = [
    { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },  // blue
    { bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' },  // emerald
    { bg: '#f5f3ff', color: '#7c3aed', border: '#c4b5fd' },  // violet
    { bg: '#fffbeb', color: '#d97706', border: '#fcd34d' },  // amber
    { bg: '#fff1f2', color: '#e11d48', border: '#fda4af' },  // rose
    { bg: '#ecfeff', color: '#0891b2', border: '#a5f3fc' },  // cyan
    { bg: '#fdf4ff', color: '#c026d3', border: '#e879f9' },  // fuchsia
    { bg: '#fff7ed', color: '#ea580c', border: '#fdba74' },  // orange
    { bg: '#f0fdfa', color: '#0d9488', border: '#5eead4' },  // teal
    { bg: '#eef2ff', color: '#4f46e5', border: '#a5b4fc' },  // indigo
];
function getAvatarColor(name: string) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// Normalize type values — DB stores mixed case ("Customer") but our keys are uppercase
function normalizeType(type: string | null | undefined): string | null {
    if (!type) return null;
    const upper = type.toUpperCase().replace(/\s+/g, '_');
    if (upper === 'CUSTOMER') return 'CUSTOMER';
    if (upper === 'PROSPECT' || upper === 'PROSPECT_COMPANY') return 'PROSPECT';
    if (upper === 'FORMER_CUSTOMER' || upper === 'FORMER') return 'FORMER_CUSTOMER';
    if (upper === 'BLACKLISTED') return 'BLACKLISTED';
    return upper;
}

// Inline styles for type badges — guaranteed to render
const TYPE_BADGE_INLINE: Record<string, React.CSSProperties> = {
    CUSTOMER: { backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' },
    PROSPECT: { backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' },
    FORMER_CUSTOMER: { backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' },
    BLACKLISTED: { backgroundColor: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' },
};

const TYPE_LABELS: Record<string, string> = {
    CUSTOMER: 'Customer',
    PROSPECT: 'Prospect',
    FORMER_CUSTOMER: 'Former',
    BLACKLISTED: 'Blacklisted',
};

function extractDomain(website: string | null | undefined): string | null {
    if (!website) return null;
    try {
        let url = website.trim();
        if (!url.startsWith('http')) url = 'https://' + url;
        const parsed = new URL(url);
        return parsed.hostname.replace(/^www\./, '');
    } catch {
        return website.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    }
}

function formatDate(dateString: Date | string) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

const ACCOUNT_COLUMNS: ColumnDef[] = [
    { key: "name", label: "Account", locked: true },
    { key: "industry", label: "Industry" },
    { key: "type", label: "Type" },
    { key: "contacts", label: "Contacts" },
    { key: "owner", label: "Owner" },
    { key: "nextFu", label: "Next FU" },
    { key: "lastModified", label: "Last Modified" },
    { key: "website", label: "Website", defaultVisible: false },
    { key: "phone", label: "Phone", defaultVisible: false },
    { key: "source", label: "Source", defaultVisible: false },
    { key: "createdAt", label: "Created", defaultVisible: false },
];

interface AccountListClientProps {
    accounts: any[];
    query: string;
    sortUrls: Record<string, string>;
    sort: string;
    order: string;
    filterParams: string;
    page: number;
    totalPages: number;
    totalCount: number;
    pageUrls: { prev: string | null; next: string | null };
    isFiltered: boolean;
}

export default function AccountListClient({
    accounts,
    query,
    sortUrls,
    sort,
    order,
    filterParams,
    page,
    totalPages,
    totalCount,
    pageUrls,
    isFiltered,
}: AccountListClientProps) {
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [allGlobalSelected, setAllGlobalSelected] = useState(false);
    const { visibleColumns, toggle, isVisible } = useColumnVisibility("crm-accounts-columns", ACCOUNT_COLUMNS);

    const toggleSelect = useCallback((id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
        setAllGlobalSelected(false);
    }, []);

    const toggleSelectAll = useCallback(() => {
        if (selectedIds.size === accounts.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(accounts.map((a) => a.id)));
        }
    }, [accounts, selectedIds.size]);

    const deselectAll = useCallback(() => {
        setSelectedIds(new Set());
        setAllGlobalSelected(false);
    }, []);

    const selectAllGlobal = useCallback(() => setAllGlobalSelected(true), []);
    const deselectAllGlobal = useCallback(() => {
        setSelectedIds(new Set());
        setAllGlobalSelected(false);
    }, []);

    const [cloneModalOpen, setCloneModalOpen] = useState(false);
    const [cloneModalLoading, setCloneModalLoading] = useState(false);
    const [alertModalOpen, setAlertModalOpen] = useState(false);
    const [alertModalConfig, setAlertModalConfig] = useState({ title: "", description: "", variant: "success" as "success" | "danger" | "info" });

    const handleCloneSelected = useCallback(() => {
        if (selectedIds.size === 0) return;
        setCloneModalOpen(true);
    }, [selectedIds.size]);

    const handleCloneConfirm = useCallback(async () => {
        setCloneModalLoading(true);
        try {
            const ids = Array.from(selectedIds);
            const { cloneAccounts } = await import("@/app/actions/commercial/company");
            const res = await cloneAccounts(ids);
            setCloneModalOpen(false);
            if (res.success) {
                setSelectedIds(new Set());
                setAllGlobalSelected(false);
                setAlertModalConfig({
                    title: "Success",
                    description: `Successfully cloned ${res.count} account(s). Cloned accounts have "(CLONED)" added to their names.`,
                    variant: "success"
                });
                setAlertModalOpen(true);
            } else {
                setAlertModalConfig({
                    title: "Error",
                    description: `Failed to clone accounts: ${res.error}`,
                    variant: "danger"
                });
                setAlertModalOpen(true);
            }
        } catch (err: any) {
            console.error("Cloning error:", err);
            setCloneModalOpen(false);
            setAlertModalConfig({
                title: "Error",
                description: `An error occurred: ${err.message || err}`,
                variant: "danger"
            });
            setAlertModalOpen(true);
        } finally {
            setCloneModalLoading(false);
        }
    }, [selectedIds]);

    const handleAlertModalClose = useCallback(() => {
        setAlertModalOpen(false);
        if (alertModalConfig.variant === "success") {
            window.location.reload();
        }
    }, [alertModalConfig.variant]);

    const allSelected = accounts.length > 0 && selectedIds.size === accounts.length;
    const someSelected = selectedIds.size > 0 && selectedIds.size < accounts.length;

    const tableRef = useRef<HTMLDivElement>(null);
    const scrollTable = useCallback((dir: 'left' | 'right') => {
        tableRef.current?.scrollBy({ left: dir === 'right' ? 300 : -300, behavior: 'smooth' });
    }, []);

    return (
        <>
            {/* Count + Column selector */}
            <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-gray-400" style={{ fontFamily: 'var(--font-lato)' }}>
                    <span className="font-semibold text-gray-500">{page * 100 + 1}–{Math.min((page + 1) * 100, totalCount)}</span>{' '}
                    of <span className="font-semibold text-gray-500">{totalCount}</span> account{totalCount !== 1 ? 's' : ''}
                    {isFiltered && <span className="text-gray-400"> (filtered)</span>}
                </p>
                <div className="flex items-center gap-1.5">
                    <button onClick={() => scrollTable('left')} className="p-1 rounded-md border border-gray-200 bg-white text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-all">
                        <ChevronLeft size={14} />
                    </button>
                    <button onClick={() => scrollTable('right')} className="p-1 rounded-md border border-gray-200 bg-white text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-all">
                        <ChevronRight size={14} />
                    </button>
                    <ColumnSelector
                        columns={ACCOUNT_COLUMNS}
                        storageKey="crm-accounts-columns"
                        visibleColumns={visibleColumns}
                        onToggle={toggle}
                    />
                </div>
            </div>
            <div ref={tableRef} className="bg-white rounded-lg border border-gray-100 overflow-x-auto scrollbar-hide">
                <table className="w-full table-auto divide-y divide-gray-100">
                    <thead>
                        <tr className="border-b border-gray-200">
                            {/* Checkbox header */}
                            <th className="w-[36px] px-2 py-2.5">
                                <div
                                    onClick={toggleSelectAll}
                                    className={`w-4 h-4 rounded border-2 cursor-pointer transition-all flex items-center justify-center ${
                                        allSelected
                                            ? "bg-blue-600 border-blue-600"
                                            : someSelected
                                            ? "bg-blue-600 border-blue-600"
                                            : "border-gray-300 hover:border-blue-400"
                                    }`}
                                >
                                    {allSelected && (
                                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    )}
                                    {someSelected && !allSelected && (
                                        <div className="w-2 h-0.5 bg-white rounded" />
                                    )}
                                </div>
                            </th>
                            {/* Sortable: Name (always visible, locked) */}
                            <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                                <Link href={sortUrls.name} className="inline-flex items-center gap-1 hover:text-blue-600 transition-colors">
                                    Name
                                    <span className={`text-[8px] ${sort === 'name' ? 'text-blue-600' : 'text-gray-300'}`}>{sort === 'name' && order === 'asc' ? '▲' : '▼'}</span>
                                </Link>
                            </th>
                            {/* Sortable columns: Industry, Type */}
                            {([['industry', 'industry', 'Industry'], ['type', 'type', 'Type']] as const).map(([colKey, sortKey, label]) =>
                                isVisible(colKey) && (
                                    <th key={colKey} className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                                        <Link href={sortUrls[sortKey]} className="inline-flex items-center gap-1 hover:text-blue-600 transition-colors">
                                            {label}
                                            <span className={`text-[8px] ${sort === sortKey ? 'text-blue-600' : 'text-gray-300'}`}>{sort === sortKey && order === 'asc' ? '▲' : '▼'}</span>
                                        </Link>
                                    </th>
                                )
                            )}
                            {/* Non-sortable: Contacts, Owner */}
                            {isVisible('contacts') && (
                            <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                                Contacts
                            </th>
                            )}
                            {isVisible('owner') && (
                            <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                                Owner
                            </th>
                            )}
                            {/* Sortable: Next FU */}
                            {isVisible('nextFu') && (
                            <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                                <Link href={sortUrls.fu} className="inline-flex items-center gap-1 hover:text-blue-600 transition-colors">
                                    Next FU
                                    <span className={`text-[8px] ${sort === 'fu' ? 'text-blue-600' : 'text-gray-300'}`}>{sort === 'fu' && order === 'asc' ? '▲' : '▼'}</span>
                                </Link>
                            </th>
                            )}
                            {/* Sortable: Last Modified */}
                            {isVisible('lastModified') && (
                            <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                                <Link href={sortUrls.modified} className="inline-flex items-center gap-1 hover:text-blue-600 transition-colors">
                                    Last Modified
                                    <span className={`text-[8px] ${sort === 'modified' ? 'text-blue-600' : 'text-gray-300'}`}>{sort === 'modified' && order === 'asc' ? '▲' : '▼'}</span>
                                </Link>
                            </th>
                            )}
                            {/* Hidden-by-default sortable columns: Website, Phone, Source, Created */}
                            {([['website', 'website', 'Website'], ['phone', 'phone', 'Phone'], ['source', 'source', 'Source'], ['createdAt', 'createdAt', 'Created']] as const).map(([colKey, sortKey, label]) =>
                                isVisible(colKey) && (
                                    <th key={colKey} className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                                        <Link href={sortUrls[sortKey]} className="inline-flex items-center gap-1 hover:text-blue-600 transition-colors">
                                            {label}
                                            <span className={`text-[8px] ${sort === sortKey ? 'text-blue-600' : 'text-gray-300'}`}>{sort === sortKey && order === 'asc' ? '▲' : '▼'}</span>
                                        </Link>
                                    </th>
                                )
                            )}
                            <th className="w-full"></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-50">
                        {accounts.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-3 py-20 text-center">
                                    <div className="flex flex-col items-center gap-2 text-gray-400">
                                        <div className="p-4 bg-gray-50 rounded-full">
                                            <Building2 size={40} className="text-gray-200" />
                                        </div>
                                        <p className="font-medium text-gray-500" style={{ fontFamily: 'var(--font-lato)' }}>No accounts found matching your criteria.</p>
                                        <p className="text-sm text-gray-400" style={{ fontFamily: 'var(--font-lato)' }}>Try adjusting your filters.</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            accounts.map((account: any) => {
                                const isSelected = selectedIds.has(account.id);
                                const avatarColor = getAvatarColor(account.name || "CO");
                                const initials = (account.name || "CO").substring(0, 2).toUpperCase();
                                const domain = extractDomain(account.website);
                                const ownerName = account.owner?.name;
                                const ownerFirst = ownerName ? ownerName.split(' ')[0] : null;
                                const ownerInitials = ownerName ? ownerName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) : null;
                                const ownerColor = ownerName ? getAvatarColor(ownerName) : null;
                                const contactCount = account._count?.contacts || 0;
                                const normalizedType = normalizeType(account.type);
                                const isCustomerWithNoContacts = normalizedType === 'CUSTOMER' && contactCount === 0;

                                return (
                                    <ClickableRow
                                        key={account.id}
                                        destination={`/commercial/accounts/${account.id}${query ? `?q=${query}` : ""}`}
                                    >
                                        {/* Checkbox cell */}
                                        <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                                            <div
                                                onClick={(e) => toggleSelect(account.id, e)}
                                                className={`w-4 h-4 rounded border-2 cursor-pointer transition-all flex items-center justify-center ${
                                                    isSelected
                                                        ? "bg-blue-600 border-blue-600"
                                                        : "border-gray-300 hover:border-blue-400"
                                                }`}
                                            >
                                                {isSelected && (
                                                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                                        <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                )}
                                            </div>
                                        </td>
                                        {/* Name + Domain */}
                                        <td className="px-3 py-2.5 overflow-hidden" style={{ height: '60px' }}>
                                            <div className="flex items-center gap-2.5">
                                                <div
                                                    className="h-8 w-8 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                                                    style={{ backgroundColor: avatarColor.bg, color: avatarColor.color, border: `1px solid ${avatarColor.border}` }}
                                                >
                                                    {initials}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[13px] font-medium text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                                                        {account.name}
                                                    </p>
                                                    <p className="text-[11px] text-gray-400 truncate mt-0.5">
                                                        {domain || '—'}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        {/* Industry */}
                                        {isVisible('industry') && (
                                        <td className="px-3 py-2.5 overflow-hidden">
                                            <span className="text-[12px] text-gray-500 truncate block">
                                                {account.industry || <span className="italic text-gray-300">—</span>}
                                            </span>
                                        </td>
                                        )}
                                        {/* Type Badge */}
                                        {isVisible('type') && (
                                        <td className="px-3 py-2.5 overflow-hidden">
                                            <div className="flex flex-col gap-0.5">
                                                {normalizedType ? (
                                                    <span
                                                        className="inline-flex w-fit px-2 py-0.5 rounded-md text-[10px] font-bold"
                                                        style={TYPE_BADGE_INLINE[normalizedType] || { backgroundColor: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' }}
                                                    >
                                                        {TYPE_LABELS[normalizedType] || account.type}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-300 text-[12px]">—</span>
                                                )}
                                                {account.isArchived && (
                                                    <span title={account.archiveReason || 'Archived'} className="inline-flex w-fit px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-gray-100 text-gray-500 border border-gray-200">
                                                        Archived
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        )}
                                        {/* Contacts */}
                                        {isVisible('contacts') && (
                                        <td className="px-3 py-2.5 overflow-hidden">
                                            {isCustomerWithNoContacts ? (
                                                <span
                                                    className="inline-flex items-center gap-1 text-[12px] font-semibold text-red-600"
                                                    title="Customer with no contacts — consider adding a decision maker"
                                                >
                                                    0
                                                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                                                </span>
                                            ) : (
                                                <span className="text-[12px] text-gray-600">{contactCount}</span>
                                            )}
                                        </td>
                                        )}
                                        {/* Owner */}
                                        {isVisible('owner') && (
                                        <td className="px-3 py-2.5 overflow-hidden">
                                            {ownerName ? (
                                                <span className="text-[12px] text-gray-600 truncate">{ownerFirst}</span>
                                            ) : (
                                                <span className="text-gray-300 text-[12px]">—</span>
                                            )}
                                        </td>
                                        )}
                                        {/* Next FU */}
                                        {isVisible('nextFu') && (
                                        <td className="px-3 py-2.5 overflow-hidden">
                                            {account.nextFu ? (
                                                (() => {
                                                    const fuDate = new Date(account.nextFu);
                                                    const today = new Date();
                                                    today.setHours(0, 0, 0, 0);
                                                    const isOverdue = fuDate < today;
                                                    return (
                                                        <span className={`text-[12px] tabular-nums ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                                                            {formatDate(account.nextFu)}
                                                        </span>
                                                    );
                                                })()
                                            ) : (
                                                <span className="text-gray-300 text-[12px]">—</span>
                                            )}
                                        </td>
                                        )}
                                        {/* Last Modified */}
                                        {isVisible('lastModified') && (
                                        <td className="px-3 py-2.5 overflow-hidden">
                                            <span className="text-[12px] text-gray-500 tabular-nums">
                                                {formatDate(account.updatedAt)}
                                            </span>
                                        </td>
                                        )}
                                        <td className="w-full"></td>
                                    </ClickableRow>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Export toolbar */}
            <ExportToolbar
                selectedCount={selectedIds.size}
                totalCount={accounts.length}
                globalTotalCount={totalCount}
                entityType="accounts"
                selectedIds={Array.from(selectedIds)}
                filterParams={filterParams}
                onSelectAll={toggleSelectAll}
                onDeselectAll={deselectAll}
                allGlobalSelected={allGlobalSelected}
                onSelectAllGlobal={selectAllGlobal}
                onDeselectAllGlobal={deselectAllGlobal}
                visibleColumns={visibleColumns}
                isFiltered={isFiltered}
                onClone={handleCloneSelected}
            />

            {/* Pagination controls */}
            <div className="flex items-center justify-between mt-3">
                <div />
                {totalPages > 1 && (
                    <div className="flex items-center gap-4">
                        {pageUrls.prev ? (
                            <Link href={pageUrls.prev} className="inline-flex items-center text-xs text-gray-400 hover:text-gray-500 transition-colors">
                                ← Previous
                            </Link>
                        ) : (
                            <span className="text-xs text-gray-300">← Previous</span>
                        )}
                        <span className="text-xs text-gray-400">
                            Page {page + 1} of {totalPages}
                        </span>
                        {pageUrls.next ? (
                            <Link href={pageUrls.next} className="inline-flex items-center text-xs text-gray-400 hover:text-gray-500 transition-colors">
                                Next →
                            </Link>
                        ) : (
                            <span className="text-xs text-gray-300">Next →</span>
                        )}
                    </div>
                )}
            </div>

            <ConfirmModal
                isOpen={cloneModalOpen}
                onClose={() => setCloneModalOpen(false)}
                onConfirm={handleCloneConfirm}
                title="Clone Accounts"
                description={`Are you sure you want to clone the ${selectedIds.size} selected account(s)? This will duplicate their information with "(CLONED)" added to their names.`}
                confirmLabel="Clone"
                cancelLabel="Cancel"
                isLoading={cloneModalLoading}
                variant="info"
            />

            <AlertModal
                isOpen={alertModalOpen}
                onClose={handleAlertModalClose}
                title={alertModalConfig.title}
                description={alertModalConfig.description}
                variant={alertModalConfig.variant}
                dismissLabel="OK"
            />
        </>
    );
}
