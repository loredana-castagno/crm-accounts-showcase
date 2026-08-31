/**
 * Boolean search engine for Commercial modules (Leads, Contacts, Accounts).
 * Supports AND, OR, parentheses, implicit AND (space-separated), and trailing operator handling.
 */

function isBalanced(str: string) {
    let depth = 0;
    for (const char of str) {
        if (char === "(") depth++;
        else if (char === ")") depth--;
        if (depth < 0) return false;
    }
    return depth === 0;
}

function findSplitIndex(str: string, operator: string) {
    let depth = 0;
    const upper = str.toUpperCase();
    for (let i = 0; i < str.length; i++) {
        if (str[i] === "(") depth++;
        else if (str[i] === ")") depth--;
        else if (depth === 0 && upper.startsWith(operator, i)) return i;
    }
    return -1;
}

function createTermCondition(term: string, fields: string[]): any {
    const lowerTerm = term.toLowerCase();
    const conditions: any[] = [];
    for (const field of fields) {
        if (field.includes(".")) {
            // Nested field like "account.name"
            const [relation, prop] = field.split(".");
            conditions.push({ [relation]: { [prop]: { contains: term } } });
            conditions.push({ [relation]: { [prop]: { contains: lowerTerm } } });
        } else {
            conditions.push({ [field]: { contains: term } });
            conditions.push({ [field]: { contains: lowerTerm } });
        }
    }
    return { OR: conditions };
}

function buildInternal(query: string, fields: string[]): any {
    let trimmed = query.trim();
    if (!trimmed) return {};

    // Unwrap outer parentheses
    while (trimmed.startsWith("(") && trimmed.endsWith(")") && isBalanced(trimmed.slice(1, -1))) {
        trimmed = trimmed.slice(1, -1).trim();
    }

    // OR (lowest precedence)
    const orIdx = findSplitIndex(trimmed, " OR ");
    if (orIdx !== -1) {
        const left = trimmed.substring(0, orIdx).trim();
        const right = trimmed.substring(orIdx + 4).trim();
        if (!right) return buildInternal(left, fields);
        if (!left) return buildInternal(right, fields);
        return {
            OR: [buildInternal(left, fields), buildInternal(right, fields)]
        };
    }

    // AND (explicit)
    const andIdx = findSplitIndex(trimmed, " AND ");
    if (andIdx !== -1) {
        const left = trimmed.substring(0, andIdx).trim();
        const right = trimmed.substring(andIdx + 5).trim();
        if (!right) return buildInternal(left, fields);
        if (!left) return buildInternal(right, fields);
        return {
            AND: [buildInternal(left, fields), buildInternal(right, fields)]
        };
    }

    // Implicit AND: space-separated words
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
        return {
            AND: words.map(w => createTermCondition(w, fields))
        };
    }

    // Single term
    return createTermCondition(trimmed, fields);
}

/**
 * Build a Prisma-compatible where clause for boolean text search.
 * @param query The raw search string (may contain AND, OR, parentheses)
 * @param fields Array of field names to search (use "relation.field" for nested)
 * @returns Prisma where fragment to merge into your where clause
 */
export function buildCommercialSearchCondition(query: string, fields: string[]): any | null {
    const trimmed = query.trim();
    if (!trimmed) return null;
    return buildInternal(trimmed, fields);
}
