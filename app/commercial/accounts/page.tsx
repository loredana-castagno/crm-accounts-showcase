import { db } from "@/app/lib/db";
import Link from "next/link";
import { Plus, Building2 } from "lucide-react";
import AccountsSearchInput from "./AccountsSearchInput";
import { buildCommercialSearchCondition } from "@/app/lib/commercialSearch";
import AccountListClient from "./AccountListClient";
import AccountsFiltersDropdown from "./AccountsFiltersDropdown";
import AdvancedFilters, { FilterConfig } from "@/app/components/AdvancedFilters";
import { getAccountFilterOptions } from "@/app/lib/commercialFilterOptions";
import {
    applyScalarFilter, applyOwnerFilter, applyTechnologiesFilter,
    applyCompanySizeFilter, applyPipelineCoverageFilter, applyFuStatusFilter,
    applyContactTitleFilter,
    COMPANY_SIZE_OPTIONS, PIPELINE_COVERAGE_OPTIONS, FU_STATUS_OPTIONS,
} from "@/app/lib/commercialFilters";

const PAGE_SIZE = 100;

// Advanced filter URL param keys for Accounts (preserved across pills/sort/page).
const ACCOUNT_ADV_KEYS = ['owner', 'industry', 'source', 'outsourcing', 'country', 'technologies', 'companySize', 'pipeline', 'fuStatus', 'contactTitle'] as const;

const TYPE_FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'CUSTOMER', label: 'Customer' },
    { key: 'PROSPECT', label: 'Prospect' },
    { key: 'FORMER_CUSTOMER', label: 'Former' },
    { key: 'BLACKLISTED', label: 'Blacklisted' },
    { key: 'archived', label: 'Archived' },
];

export const dynamic = "force-dynamic";

export default async function AccountsPage({
    searchParams,
}: {
    searchParams: Promise<{
        q?: string;
        sort?: string; order?: string;
        type?: string;
        page?: string;
        createdFrom?: string; createdTo?: string;
        modifiedFrom?: string; modifiedTo?: string;
        fuFrom?: string; fuTo?: string;
        // Advanced filters
        owner?: string; industry?: string; source?: string; outsourcing?: string;
        country?: string; technologies?: string; companySize?: string;
        pipeline?: string; fuStatus?: string;
        contactTitle?: string;
    }>;
}) {
    const params = await searchParams;
    const query = params.q || "";
    const typeFilter = params.type || "all";
    const page = Math.max(0, parseInt(params.page || "0", 10) || 0);

    // Build where clause
    const where: any = typeFilter === 'archived'
        ? { isArchived: true }
        : { isArchived: false };

    if (typeFilter && typeFilter !== 'all' && typeFilter !== 'archived') {
        if (typeFilter === 'CUSTOMER') {
            where.type = { in: ['CUSTOMER', 'Customer', 'customer'] };
        } else if (typeFilter === 'PROSPECT') {
            where.type = { in: ['PROSPECT', 'Prospect', 'prospect', 'Prospect Company'] };
        } else if (typeFilter === 'FORMER_CUSTOMER') {
            where.type = { in: ['FORMER_CUSTOMER', 'Former Customer', 'Former', 'former_customer'] };
        } else if (typeFilter === 'BLACKLISTED') {
            where.type = { in: ['BLACKLISTED', 'Blacklisted', 'blacklisted'] };
        } else {
            where.type = typeFilter;
        }
    }

    if (query) {
        const searchCondition = buildCommercialSearchCondition(query, [
            "name", "website", "linkedinUrl",
            "industry", "phone", "address", "source",
            "description", "specialties", "companyDetails",
            "billingCity", "billingState", "billingCountry",
        ]);
        if (searchCondition) {
            where.AND = [...(where.AND || []), searchCondition];
        }
    }

    // Date-range filters (createdAt / updatedAt / nextFu)
    if (params.createdFrom || params.createdTo) {
        where.createdAt = {};
        if (params.createdFrom) where.createdAt.gte = new Date(params.createdFrom + "T00:00:00");
        if (params.createdTo) where.createdAt.lte = new Date(params.createdTo + "T23:59:59");
    }
    if (params.modifiedFrom || params.modifiedTo) {
        where.updatedAt = {};
        if (params.modifiedFrom) where.updatedAt.gte = new Date(params.modifiedFrom + "T00:00:00");
        if (params.modifiedTo) where.updatedAt.lte = new Date(params.modifiedTo + "T23:59:59");
    }
    if (params.fuFrom || params.fuTo) {
        where.nextFu = {};
        if (params.fuFrom) where.nextFu.gte = new Date(params.fuFrom + "T00:00:00");
        if (params.fuTo) where.nextFu.lte = new Date(params.fuTo + "T23:59:59");
    }

    // Advanced filters
    applyOwnerFilter(where, params.owner);
    applyScalarFilter(where, 'industry', params.industry);
    applyScalarFilter(where, 'source', params.source);
    applyScalarFilter(where, 'outsourcing', params.outsourcing);
    applyScalarFilter(where, 'billingCountry', params.country);
    applyTechnologiesFilter(where, params.technologies);
    applyCompanySizeFilter(where, params.companySize);
    applyPipelineCoverageFilter(where, params.pipeline);
    applyFuStatusFilter(where, params.fuStatus, 'nextFu');
    applyContactTitleFilter(where, params.contactTitle);

    // Sorting
    const sort = params.sort || "";
    const order = (params.order === "asc" || params.order === "desc") ? params.order : "desc";
    const SORT_FIELD_MAP: Record<string, string> = {
        name: "name", modified: "updatedAt", fu: "nextFu",
        industry: "industry", type: "type",
        website: "website", phone: "phone",
        source: "source", createdAt: "createdAt",
    };
    const NON_NULLABLE = new Set(["name", "updatedAt", "createdAt"]);
    let orderBy: any = { updatedAt: "desc" };
    if (sort && SORT_FIELD_MAP[sort]) {
        const field = SORT_FIELD_MAP[sort];
        orderBy = NON_NULLABLE.has(field)
            ? { [field]: order }
            : { [field]: { sort: order, nulls: "last" } };
    }

    // Paginated query
    const [accounts, filteredCount] = await Promise.all([
        (db as any).company.findMany({
            where,
            include: {
                owner: { select: { name: true, image: true } },
                _count: { select: { contacts: true, opportunities: true } },
            },
            orderBy,
            take: PAGE_SIZE,
            skip: page * PAGE_SIZE,
        }),
        (db as any).company.count({ where }),
    ]);

    // Counts for pills
    const [totalCount, customerCount, prospectCount, formerCount, blacklistedCount, archivedCount] = await Promise.all([
        (db as any).company.count({ where: { isArchived: false } }),
        (db as any).company.count({ where: { isArchived: false, type: { in: ['CUSTOMER', 'Customer', 'customer'] } } }),
        (db as any).company.count({ where: { isArchived: false, type: { in: ['PROSPECT', 'Prospect', 'prospect', 'Prospect Company'] } } }),
        (db as any).company.count({ where: { isArchived: false, type: { in: ['FORMER_CUSTOMER', 'Former Customer', 'Former', 'former_customer'] } } }),
        (db as any).company.count({ where: { isArchived: false, type: { in: ['BLACKLISTED', 'Blacklisted', 'blacklisted'] } } }),
        (db as any).company.count({ where: { isArchived: true } }),
    ]);

    const pillCounts: Record<string, number> = {
        all: totalCount,
        CUSTOMER: customerCount,
        PROSPECT: prospectCount,
        FORMER_CUSTOMER: formerCount,
        BLACKLISTED: blacklistedCount,
        archived: archivedCount,
    };

    const filterOptions = await getAccountFilterOptions();
    const accountFilterConfigs: FilterConfig[] = [
        { key: 'owner', label: 'Owner', options: filterOptions.owner, defaultVisible: false },
        { key: 'pipeline', label: 'Pipeline', options: PIPELINE_COVERAGE_OPTIONS, defaultVisible: false },
        { key: 'fuStatus', label: 'FU Status', options: FU_STATUS_OPTIONS, defaultVisible: false },
        { key: 'industry', label: 'Industry', options: filterOptions.industry, defaultVisible: false },
        { key: 'outsourcing', label: 'Outsourcing', options: filterOptions.outsourcing.length ? filterOptions.outsourcing : ['Yes', 'No', 'N/A'], defaultVisible: false },
        { key: 'technologies', label: 'Technologies', options: filterOptions.technologies, defaultVisible: false },
        { key: 'companySize', label: 'Company Size', options: COMPANY_SIZE_OPTIONS, defaultVisible: false },
        { key: 'source', label: 'Source', options: filterOptions.source, defaultVisible: false },
        { key: 'country', label: 'Country', options: filterOptions.country, defaultVisible: false },
        { key: 'contactTitle', label: 'Title', options: filterOptions.title, defaultVisible: false },
    ];

    const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
    const sortLabel = sort === 'name'
        ? `name ${order === 'asc' ? '↑' : '↓'}`
        : sort === 'fu'
            ? `FU date ${order === 'asc' ? '↑' : '↓'}`
            : 'last modified';

    // Build URL helpers
    const buildParams = (overrides: Record<string, string | undefined> = {}) => {
        const p = new URLSearchParams();
        if (params.q) p.set("q", params.q);
        if (params.type) p.set("type", params.type);
        if (params.sort) p.set("sort", params.sort);
        if (params.order) p.set("order", params.order);
        if (params.createdFrom) p.set("createdFrom", params.createdFrom);
        if (params.createdTo) p.set("createdTo", params.createdTo);
        if (params.modifiedFrom) p.set("modifiedFrom", params.modifiedFrom);
        if (params.modifiedTo) p.set("modifiedTo", params.modifiedTo);
        if (params.fuFrom) p.set("fuFrom", params.fuFrom);
        if (params.fuTo) p.set("fuTo", params.fuTo);
        for (const k of ACCOUNT_ADV_KEYS) { if (params[k]) p.set(k, params[k]!); }
        Object.entries(overrides).forEach(([k, v]) => {
            if (v !== undefined) p.set(k, v); else p.delete(k);
        });
        return p.toString();
    };

    const buildSortUrl = (col: string) => {
        return `/commercial/accounts?${buildParams({
            sort: col,
            order: sort === col && order === "asc" ? "desc" : "asc",
            page: undefined,
        })}`;
    };

    const buildTypeUrl = (type: string) => {
        const p = new URLSearchParams();
        if (params.q) p.set("q", params.q);
        if (params.sort) p.set("sort", params.sort);
        if (params.order) p.set("order", params.order);
        if (params.createdFrom) p.set("createdFrom", params.createdFrom);
        if (params.createdTo) p.set("createdTo", params.createdTo);
        if (params.modifiedFrom) p.set("modifiedFrom", params.modifiedFrom);
        if (params.modifiedTo) p.set("modifiedTo", params.modifiedTo);
        if (params.fuFrom) p.set("fuFrom", params.fuFrom);
        if (params.fuTo) p.set("fuTo", params.fuTo);
        for (const k of ACCOUNT_ADV_KEYS) { if (params[k]) p.set(k, params[k]!); }
        if (type !== 'all') p.set("type", type);
        return `/commercial/accounts?${p.toString()}`;
    };

    const buildPageUrl = (p: number) => `/commercial/accounts?${buildParams({ page: p > 0 ? p.toString() : undefined })}`;

    const filterParams = buildParams();

    return (
        <div className="flex-1 overflow-auto min-h-[calc(100vh-theme(spacing.24))]" style={{ backgroundColor: '#F8FAFC' }}>
            <div className="p-4 max-w-7xl mx-auto space-y-3">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 rounded-lg text-blue-600 border border-blue-100">
                            <Building2 size={18} />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-600" style={{ fontFamily: 'var(--font-montserrat)' }}>
                                Accounts
                            </h1>
                            <p className="text-gray-500 text-sm mt-0.5" style={{ fontFamily: 'var(--font-lato)' }}>
                                Manage your accounts and business partners.
                            </p>
                        </div>
                    </div>
                    <Link
                        href="/commercial/accounts/new"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 transition-all mr-14"
                        style={{ fontFamily: 'var(--font-lato)' }}
                    >
                        <Plus className="w-4 h-4" />
                        New Account
                    </Link>
                </div>

                <AccountsSearchInput />

                <div className="space-y-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {TYPE_FILTERS.map(f => {
                            const isActive = typeFilter === f.key;
                            const count = pillCounts[f.key] ?? 0;
                            return (
                                <Link
                                    key={f.key}
                                    href={buildTypeUrl(f.key)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                                        isActive
                                            ? 'bg-gray-800 text-white shadow-sm'
                                            : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300 hover:text-gray-700'
                                    }`}
                                >
                                    {f.label} {count}
                                </Link>
                            );
                        })}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <AccountsFiltersDropdown />
                        <AdvancedFilters configs={accountFilterConfigs} storageKey="crm-accounts-adv-filters" hideSalaryFilters />
                    </div>
                </div>

                <AccountListClient
                    accounts={accounts}
                    query={query}
                    sortUrls={Object.fromEntries(Object.keys(SORT_FIELD_MAP).map(k => [k, buildSortUrl(k)]))}
                    sort={sort}
                    order={order}
                    filterParams={filterParams}
                    page={page}
                    totalPages={totalPages}
                    totalCount={filteredCount}
                    pageUrls={{
                        prev: page > 0 ? buildPageUrl(page - 1) : null,
                        next: page < totalPages - 1 ? buildPageUrl(page + 1) : null,
                    }}
                    isFiltered={!!(
                        // Type pills (Customer/Prospect/Former/Archived) act as view tabs,
                        // not filters — they don't trigger the Export Current View toolbar.
                        query ||
                        params.createdFrom || params.createdTo ||
                        params.modifiedFrom || params.modifiedTo ||
                        params.fuFrom || params.fuTo ||
                        ACCOUNT_ADV_KEYS.some(k => params[k])
                    )}
                />
            </div>
        </div>
    );
}
