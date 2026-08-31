"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, ChevronDown, X, Calendar } from "lucide-react";
import { useState, useRef, useEffect } from "react";

/**
 * AccountsFiltersDropdown — Date-range filters for the Accounts board.
 * Mirrors LeadsFiltersDropdown and adds an "FU Date" section bound to
 * `Company.nextFu` (the "Next Follow-Up" date used by sales to plan calls).
 */
export default function AccountsFiltersDropdown() {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const { replace } = useRouter();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function outside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", outside);
        return () => document.removeEventListener("mousedown", outside);
    }, []);

    const createdFrom = searchParams.get("createdFrom") || "";
    const createdTo = searchParams.get("createdTo") || "";
    const modifiedFrom = searchParams.get("modifiedFrom") || "";
    const modifiedTo = searchParams.get("modifiedTo") || "";
    const fuFrom = searchParams.get("fuFrom") || "";
    const fuTo = searchParams.get("fuTo") || "";

    const hasCreated = !!(createdFrom || createdTo);
    const hasModified = !!(modifiedFrom || modifiedTo);
    const hasFu = !!(fuFrom || fuTo);
    const activeCount = (hasCreated ? 1 : 0) + (hasModified ? 1 : 0) + (hasFu ? 1 : 0);

    const setParam = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams);
        if (value) params.set(key, value);
        else params.delete(key);
        replace(`${pathname}?${params.toString()}`);
    };

    const clearSection = (from: string, to: string) => {
        const params = new URLSearchParams(searchParams);
        params.delete(from);
        params.delete(to);
        replace(`${pathname}?${params.toString()}`);
    };

    const clearAll = () => {
        const params = new URLSearchParams(searchParams);
        params.delete("createdFrom");
        params.delete("createdTo");
        params.delete("modifiedFrom");
        params.delete("modifiedTo");
        params.delete("fuFrom");
        params.delete("fuTo");
        replace(`${pathname}?${params.toString()}`);
        setOpen(false);
    };

    const renderDateSection = (
        title: string,
        from: string,
        to: string,
        fromKey: string,
        toKey: string,
        has: boolean
    ) => (
        <div>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                    <Calendar size={12} className="text-gray-400" />
                    <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">{title}</span>
                </div>
                {has && (
                    <button
                        type="button"
                        onClick={() => clearSection(fromKey, toKey)}
                        className="text-gray-300 hover:text-red-400 transition-colors"
                    >
                        <X size={12} />
                    </button>
                )}
            </div>
            <div className="flex items-center gap-2">
                <input
                    type="date"
                    value={from}
                    max={to || undefined}
                    onChange={e => setParam(fromKey, e.target.value)}
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-medium focus:border-blue-400 outline-none transition-all bg-gray-50 focus:bg-white"
                />
                <span className="text-[10px] text-gray-300 font-bold">→</span>
                <input
                    type="date"
                    value={to}
                    min={from || undefined}
                    onChange={e => setParam(toKey, e.target.value)}
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-medium focus:border-blue-400 outline-none transition-all bg-gray-50 focus:bg-white"
                />
            </div>
        </div>
    );

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    activeCount > 0
                        ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
                        : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300 hover:text-gray-700'
                }`}
            >
                <SlidersHorizontal size={12} />
                Date Filter
                {activeCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[9px] font-black bg-blue-600 text-white rounded-full">
                        {activeCount}
                    </span>
                )}
                <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {open && (
                <div className="absolute left-0 top-full mt-2 z-50 bg-white border border-gray-100 rounded-xl shadow-xl w-[300px] animate-in fade-in slide-in-from-top-1 duration-150 overflow-hidden">
                    <div className="px-4 py-2.5 flex items-center justify-between border-b border-gray-100">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Date Filters</span>
                        {activeCount > 0 && (
                            <button
                                type="button"
                                onClick={clearAll}
                                className="text-[10px] font-bold text-red-400 hover:text-red-600 transition-colors"
                            >
                                Clear all
                            </button>
                        )}
                    </div>

                    <div className="p-4 space-y-4">
                        {renderDateSection("Creation Date", createdFrom, createdTo, "createdFrom", "createdTo", hasCreated)}
                        <div className="border-t border-gray-100" />
                        {renderDateSection("Last Modified", modifiedFrom, modifiedTo, "modifiedFrom", "modifiedTo", hasModified)}
                        <div className="border-t border-gray-100" />
                        {renderDateSection("FU Date", fuFrom, fuTo, "fuFrom", "fuTo", hasFu)}
                    </div>
                </div>
            )}
        </div>
    );
}
