'use native';
'use client';

import { useState } from 'react';
import Link from 'next/link';
import ClickableRow from '@/app/components/ClickableRow';
import { clsx } from 'clsx';
import {
    ChevronDown,
    ChevronUp,
    MoreHorizontal,
    Settings2,
    ArrowUpDown,
    Check,
    X,
    Search,
    Building2
} from 'lucide-react';

interface Account {
    id: number;
    name: string;
    industry?: string | null;
    address?: string | null;
    type?: string | null;
    owner?: { name: string | null; image?: string | null } | null;
    updatedAt: Date | string; // ISO String or Date
    _count?: { contacts: number };
}

interface AccountsTableProps {
    accounts: Account[];
}

export default function AccountsTable({ accounts: initialAccounts }: AccountsTableProps) {
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set([
        'name', 'industry', 'type', 'contacts', 'owner', 'last_modified'
    ]));
    const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);

    // Filtering State
    const [filters, setFilters] = useState<Record<string, Set<string>>>({});
    const [searchFilters, setSearchFilters] = useState<Record<string, string>>({});
    const [openFilterHeader, setOpenFilterHeader] = useState<string | null>(null);
    const [tempSearch, setTempSearch] = useState("");

    // Columns Definition
    const columns = [
        { key: 'name', label: 'Name', sortable: true },
        { key: 'industry', label: 'Industry', filterable: true, searchable: true },
        // { key: 'location', label: 'Location', filterable: true, searchable: true }, // Removed per user request
        { key: 'type', label: 'Type', filterable: true },
        { key: 'contacts', label: 'Contacts', sortable: true }, // Extra column useful for accounts
        { key: 'owner', label: 'Owner', filterable: true },
        { key: 'last_modified', label: 'Last Modified', sortable: true },
    ];

    // Helper: Get Unique Values for a Column
    const getUniqueValues = (key: string) => {
        if (key === 'type') return ['PROSPECT', 'CUSTOMER', 'FORMER_CUSTOMER', 'BLACKLISTED'];

        const values = new Set<string>();
        initialAccounts.forEach(account => {
            let val = '';
            switch (key) {
                case 'industry': val = account.industry || ''; break;
                case 'location': val = account.address || ''; break;
                case 'type': val = account.type || ''; break;
                case 'owner': val = account.owner?.name || ''; break;
                case 'last_modified': val = formatDate(account.updatedAt); break;
            }
            if (val) values.add(val);
        });

        let uniqueValues = Array.from(values).sort();

        if (openFilterHeader === key && tempSearch) {
            uniqueValues = uniqueValues.filter(v => v.toLowerCase().includes(tempSearch.toLowerCase()));
        }

        return uniqueValues;
    };

    const toggleFilter = (key: string, value: string) => {
        setFilters(prev => {
            const currentSet = new Set(prev[key] || []);
            if (currentSet.has(value)) {
                currentSet.delete(value);
            } else {
                currentSet.add(value);
            }
            if (currentSet.size === 0) {
                const copy = { ...prev };
                delete copy[key];
                return copy;
            }
            return { ...prev, [key]: currentSet };
        });
    };

    const clearFilter = (key: string) => {
        setFilters(prev => {
            const copy = { ...prev };
            delete copy[key];
            return copy;
        });
        setSearchFilters(prev => {
            const copy = { ...prev };
            delete copy[key];
            return copy;
        });
    };

    const applySearchFilter = (key: string, value: string) => {
        if (!value.trim()) {
            setSearchFilters(prev => {
                const copy = { ...prev };
                delete copy[key];
                return copy;
            });
        } else {
            setSearchFilters(prev => ({ ...prev, [key]: value }));
        }
        setOpenFilterHeader(null);
        setTempSearch("");
    };

    const removeSearchFilter = (key: string) => {
        setSearchFilters(prev => {
            const copy = { ...prev };
            delete copy[key];
            return copy;
        });
    };

    // Filter Logic
    const filteredAccounts = initialAccounts.filter(account => {
        return Object.entries(filters).every(([key, selectedValues]) => {
            if (searchFilters[key]) return true;
            if (selectedValues.size === 0) return true;

            let val = '';
            switch (key) {
                case 'industry': val = account.industry || ''; break;
                case 'location': val = account.address || ''; break;
                case 'type': val = account.type || ''; break;
                case 'owner': val = account.owner?.name || ''; break;
                case 'last_modified': val = formatDate(account.updatedAt); break;
            }
            return selectedValues.has(val);
        }) && Object.entries(searchFilters).every(([key, searchValue]) => {
            if (!searchValue) return true;
            let val = '';
            switch (key) {
                case 'industry': val = account.industry || ''; break;
                case 'location': val = account.address || ''; break;
            }
            return val.toLowerCase().includes(searchValue.toLowerCase());
        });
    });

    // Sorting Logic
    const sortedAccounts = [...filteredAccounts].sort((a, b) => {
        if (!sortConfig) return 0;

        if (sortConfig.key === 'name') {
            const aValue = a.name.toLowerCase();
            const bValue = b.name.toLowerCase();
            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        }

        if (sortConfig.key === 'contacts') {
            const aValue = a._count?.contacts || 0;
            const bValue = b._count?.contacts || 0;
            return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
        }

        if (sortConfig.key === 'last_modified') {
            const aDate = new Date(a.updatedAt).getTime();
            const bDate = new Date(b.updatedAt).getTime();
            if (aDate < bDate) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aDate > bDate) return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
    });

    const handleSort = (key: string) => {
        if (key !== 'name' && key !== 'last_modified' && key !== 'contacts') return;
        setSortConfig(current => {
            if (current?.key === key) {
                return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: 'asc' };
        });
    };

    const toggleColumn = (key: string) => {
        const newSet = new Set(visibleColumns);
        if (newSet.has(key)) {
            newSet.delete(key);
        } else {
            newSet.add(key);
        }
        setVisibleColumns(newSet);
    };

    const COMPANY_TYPE_LABELS: Record<string, string> = {
        PROSPECT: 'Prospect Company',
        CUSTOMER: 'Customer',
        FORMER_CUSTOMER: 'Former Customer',
        BLACKLISTED: 'Blacklisted',
    };

    const getTypeBadge = (type: string) => {
        let style = 'bg-gray-50 text-gray-600 ring-gray-500/10';
        if (type === 'CUSTOMER') style = 'bg-green-50 text-green-700 ring-green-600/20';
        if (type === 'PROSPECT') style = 'bg-blue-50 text-blue-700 ring-blue-600/20';
        if (type === 'FORMER_CUSTOMER') style = 'bg-orange-50 text-orange-700 ring-orange-600/20';
        if (type === 'BLACKLISTED') style = 'bg-red-50 text-red-700 ring-red-600/20';

        const label = COMPANY_TYPE_LABELS[type] || type;
        return (
            <span className={clsx("inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset", style)}>
                {label}
            </span>
        );
    };

    const formatDate = (dateString: Date | string) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        }).toUpperCase();
    };

    return (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col min-h-[500px]">

            {/* Toolbar */}
            <div className="px-3 py-2 border-b border-gray-100 bg-gray-50/50 flex justify-end">
                <div className="relative">
                    <button
                        onClick={() => setIsColumnMenuOpen(!isColumnMenuOpen)}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 shadow-sm"
                    >
                        <Settings2 className="h-4 w-4" />
                        Columns
                        <ChevronDown className={`h-4 w-4 transition-transform ${isColumnMenuOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Columns Dropdown */}
                    {isColumnMenuOpen && (
                        <>
                            <div
                                className="fixed inset-0 z-10"
                                onClick={() => setIsColumnMenuOpen(false)}
                            />
                            <div className="absolute right-0 mt-2 w-56 z-20 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 py-1">
                                {columns.map(col => (
                                    <button
                                        key={col.key}
                                        onClick={() => toggleColumn(col.key)}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center justify-between"
                                    >
                                        <span>{col.label}</span>
                                        {visibleColumns.has(col.key) && <Check className="h-4 w-4 text-blue-600" />}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100">
                    <thead>
                        <tr className="bg-gray-50/50">
                            {columns.filter(col => visibleColumns.has(col.key)).map((col) => (
                                <th
                                    key={col.key}
                                    scope="col"
                                    className="px-3 py-3.5 text-left text-[10px] font-medium uppercase tracking-wider text-gray-400 bg-transparent group select-none whitespace-nowrap relative"
                                >
                                    <div className="flex flex-col gap-1 items-start">
                                        <div className="flex items-center gap-1">
                                            <span
                                                className={clsx(
                                                    "transition-colors",
                                                    col.sortable && "cursor-pointer hover:text-gray-700",
                                                    (filters[col.key]?.size > 0 || searchFilters[col.key]) ? "text-blue-600 font-semibold" : "text-gray-500"
                                                )}
                                                onClick={() => col.sortable && handleSort(col.key)}
                                            >
                                                {col.label}
                                            </span>

                                            {col.sortable && (
                                                <ArrowUpDown
                                                    className={clsx(
                                                        "h-3 w-3 cursor-pointer",
                                                        sortConfig?.key === col.key ? "text-blue-600" : "text-gray-400 hover:text-gray-600"
                                                    )}
                                                    onClick={() => handleSort(col.key)}
                                                />
                                            )}

                                            {col.filterable && (
                                                <div className="relative">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setOpenFilterHeader(openFilterHeader === col.key ? null : col.key);
                                                        }}
                                                        className={clsx(
                                                            "p-1 rounded-full hover:bg-gray-200 transition-colors",
                                                            (filters[col.key]?.size > 0 || openFilterHeader === col.key || searchFilters[col.key]) ? "text-blue-600 bg-blue-50" : "text-gray-400"
                                                        )}
                                                    >
                                                        <ChevronDown className="h-3 w-3" />
                                                    </button>

                                                    {openFilterHeader === col.key && (
                                                        <>
                                                            <div
                                                                className="fixed inset-0 z-10 cursor-default"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setOpenFilterHeader(null);
                                                                    setTempSearch("");
                                                                }}
                                                            />
                                                            <div className="absolute left-0 mt-2 w-72 z-20 bg-white rounded-lg shadow-2xl ring-1 ring-black/5 py-2 text-sm font-normal normal-case animate-in fade-in zoom-in-95 duration-100 min-w-min">
                                                                {/* Dropdown Content */}
                                                                <div className="px-3 pb-3 border-b border-gray-100 flex flex-col gap-3">
                                                                    <div className="flex justify-between items-center px-1 pt-1">
                                                                        <span className="font-semibold text-gray-900 whitespace-nowrap">Filter by {col.label}</span>
                                                                        {(filters[col.key]?.size > 0 || searchFilters[col.key]) && (
                                                                            <button
                                                                                onClick={() => clearFilter(col.key)}
                                                                                className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded transition-colors whitespace-nowrap ml-2"
                                                                            >
                                                                                Clear all
                                                                            </button>
                                                                        )}
                                                                    </div>

                                                                    {(col.key === 'industry' || col.key === 'location') && (
                                                                        <div className="relative">
                                                                            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                                                                                <Search className="h-4 w-4 text-gray-400" />
                                                                            </div>
                                                                            <input
                                                                                type="text"
                                                                                autoFocus
                                                                                placeholder={`Search ${col.label}...`}
                                                                                className="block w-full rounded-lg border-gray-200 pl-9 pr-3 py-2 text-sm leading-5 placeholder:text-gray-400 focus:border-blue-500 focus:ring-blue-500 bg-gray-50/50"
                                                                                value={tempSearch}
                                                                                onChange={(e) => setTempSearch(e.target.value)}
                                                                                onKeyDown={(e) => {
                                                                                    if (e.key === 'Enter') {
                                                                                        applySearchFilter(col.key, tempSearch);
                                                                                    }
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="max-h-60 overflow-y-auto py-2 px-1 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                                                                    {getUniqueValues(col.key).length > 0 ? (
                                                                        getUniqueValues(col.key).map(val => (
                                                                            <label key={val} className="flex items-center px-3 py-2 hover:bg-gray-50 rounded-lg cursor-pointer mx-1 transition-colors group">
                                                                                <input
                                                                                    type="checkbox"
                                                                                    disabled={!!searchFilters[col.key]}
                                                                                    checked={filters[col.key]?.has(val) || false}
                                                                                    onChange={() => {
                                                                                        toggleFilter(col.key, val);
                                                                                        setOpenFilterHeader(null);
                                                                                        setTempSearch("");
                                                                                    }}
                                                                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-3 disabled:opacity-50 transition-shadow"
                                                                                />
                                                                                <span className={clsx("text-gray-700 group-hover:text-gray-900 truncate flex-1", !!searchFilters[col.key] && "opacity-50")}>{val}</span>
                                                                            </label>
                                                                        ))
                                                                    ) : (
                                                                        <div className="px-4 py-8 text-center text-sm text-gray-500">
                                                                            <p className="text-xs">No matching options found</p>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap gap-1 mt-1 max-w-[200px]">
                                            {searchFilters[col.key] && (
                                                <div className="inline-flex items-center bg-blue-50 text-blue-700 text-[10px] font-medium px-2 py-0.5 rounded-full border border-blue-100 shadow-sm animate-in fade-in zoom-in-95 duration-200">
                                                    <Search className="w-3 h-3 mr-1 opacity-50" />
                                                    <span className="truncate max-w-[80px]" title={searchFilters[col.key]}>{searchFilters[col.key]}</span>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            removeSearchFilter(col.key);
                                                        }}
                                                        className="ml-1.5 text-blue-400 hover:text-blue-600 focus:outline-none p-0.5 hover:bg-blue-100 rounded-full transition-colors"
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            )}
                                            {filters[col.key]?.size > 0 && Array.from(filters[col.key]).slice(0, 2).map(val => (
                                                <div key={val} className="inline-flex items-center bg-blue-50 text-blue-700 text-[10px] font-medium px-2 py-0.5 rounded-full border border-blue-100 shadow-sm animate-in fade-in zoom-in-95 duration-200">
                                                    <span className="truncate max-w-[80px]" title={val}>{val}</span>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleFilter(col.key, val);
                                                        }}
                                                        className="ml-1.5 text-blue-400 hover:text-blue-600 focus:outline-none p-0.5 hover:bg-blue-100 rounded-full transition-colors"
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            ))}
                                            {filters[col.key]?.size > 2 && (
                                                <div className="inline-flex items-center bg-gray-100 text-gray-600 text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-gray-200" title={Array.from(filters[col.key]).slice(2).join(', ')}>
                                                    +{filters[col.key].size - 2}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 bg-white">
                        {sortedAccounts.length > 0 ? (
                            sortedAccounts.map((account) => (
                                <ClickableRow
                                    key={account.id}
                                    destination={`/commercial/accounts/${account.id}`}
                                >
                                    {visibleColumns.has('name') && (
                                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 flex-none rounded-full bg-blue-50 text-[#0783FC] flex items-center justify-center font-bold text-xs">
                                                    {account.name ? account.name.substring(0, 2).toUpperCase() : 'CO'}
                                                </div>
                                                <Link href={`/commercial/accounts/${account.id}`} className="text-gray-900 hover:text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                                                    {account.name}
                                                </Link>
                                            </div>
                                        </td>
                                    )}
                                    {visibleColumns.has('industry') && (
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                            {account.industry ? (
                                                <div className="flex items-center gap-1.5">
                                                    <Building2 className="h-3.5 w-3.5 text-gray-400" />
                                                    <span>{account.industry}</span>
                                                </div>
                                            ) : '-'}
                                        </td>
                                    )}
                                    {visibleColumns.has('location') && (
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                            {account.address || '-'}
                                        </td>
                                    )}
                                    {visibleColumns.has('type') && (
                                        <td className="whitespace-nowrap px-3 py-4 text-sm">
                                            {account.type ? getTypeBadge(account.type) : '-'}
                                        </td>
                                    )}
                                    {visibleColumns.has('contacts') && (
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                            {account._count?.contacts || 0}
                                        </td>
                                    )}
                                    {visibleColumns.has('owner') && (
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                            {account.owner?.name || '-'}
                                        </td>
                                    )}
                                    {visibleColumns.has('last_modified') && (
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 tabular-nums">
                                            {formatDate(account.updatedAt)}
                                        </td>
                                    )}
                                </ClickableRow>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={columns.length} className="py-10 text-center text-sm text-gray-500">
                                    No accounts found matching your criteria.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}


