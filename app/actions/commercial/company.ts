'use server'

import { db as prisma } from "@/app/lib/db"
import { revalidatePath } from "next/cache"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { addSystemLog } from "@/app/actions/systemLog"

export async function getAccounts() {
    try {
        const companies = await (prisma as any).company.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                owner: {
                    select: { name: true, image: true }
                },
                _count: {
                    select: { contacts: true, opportunities: true }
                }
            }
        })
        return { success: true, data: companies }
    } catch (error) {
        console.error("Error fetching accounts:", error)
        return { success: false, error: "Failed to fetch accounts" }
    }
}

export async function getAccount(id: number) {
    try {
        const company = await (prisma as any).company.findUnique({
            where: { id },
            include: {
                owner: { select: { name: true, image: true } },
                parentAccount: { select: { id: true, name: true } },
                contacts: {
                    orderBy: [{ isArchived: 'asc' }, { createdAt: 'desc' }],
                    take: 50,
                    select: {
                        id: true, fullName: true, title: true, email: true, isArchived: true, archiveReason: true,
                        type: true, isKdm: true, reportsToId: true, reportsToId2: true, reportsToId3: true, reportsToId4: true, reportsToId5: true, buyerRole: true, orgX: true, orgY: true,
                        // Communication rating — shown as a colored dot + label in the contacts directory
                        communicationStatus: true,
                        // Follow-up scheduled on the contact (shown as a clock on the org chart card)
                        dueDate: true, dueDateCompleted: true,
                        // Notes/comments history — drives notes modal on relationship map
                        notes: {
                            orderBy: { createdAt: 'desc' },
                            select: {
                                id: true,
                                content: true,
                                createdAt: true,
                                updatedAt: true,
                                author: { select: { name: true, image: true } }
                            }
                        }
                    }
                },
                relationships: {
                    include: {
                        fromContact: { select: { id: true, fullName: true } },
                        toContact: { select: { id: true, fullName: true } }
                    }
                },
                opportunities: {
                    orderBy: [{ isArchived: 'asc' }, { createdAt: 'desc' }],
                    take: 30,
                    include: {
                        candidates: {
                            include: {
                                candidate: { select: { id: true, fullName: true } }
                            }
                        },
                        jobs: {
                            select: {
                                id: true, title: true, status: true,
                                client: true, clientManager: true, location: true, workType: true,
                                mandatorySkills: true, createdAt: true,
                                _count: { select: { applications: true } }
                            }
                        },
                        sourceContact: {
                            select: { id: true, fullName: true }
                        }
                    }
                },
                assignments: {
                    orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
                    take: 50,
                    select: {
                        id: true,
                        client: true,
                        project: true,
                        startDate: true,
                        endDate: true,
                        status: true,
                        endReason: true,
                        negotiatedRate: true,
                        negotiatedRateDate: true,
                        clientManagerName: true,
                        endClient: true,
                        salary: true,
                        salaryNegotiationDate: true,
                        holidays: true,
                        assets: {
                            select: {
                                returnedAt: true,
                                isSold: true
                            }
                        },
                        candidate: {
                            select: {
                                id: true,
                                fullName: true,
                                title: true,
                                featuredTechnologies: {
                                    select: { name: true, level: true }
                                }
                            }
                        }
                    }
                },
                typeHistory: {
                    orderBy: { createdAt: 'desc' },
                    take: 30,
                },
                activities: {
                    orderBy: { createdAt: 'desc' },
                    include: { owner: { select: { name: true, image: true } } }
                },
                notes: {
                    orderBy: { createdAt: 'desc' },
                    include: { author: { select: { name: true, image: true } } }
                }
            }
        })
        if (!company) return { success: false, error: "Account not found" }

        // Ensure complete plain object serialization for Next.js Server Component boundary
        const serialized = JSON.parse(JSON.stringify(company));

        return { success: true, data: serialized }
    } catch (error: any) {
        console.error("Error fetching account:", error?.message || error)
        return { success: false, error: error?.message || "Failed to fetch account" }
    }
}

export async function createAccount(data: any) {
    try {
        const session = await getServerSession(authOptions)
        const userId = (session?.user as any)?.id // Explicitly getting user ID

        // Prepare Company Data
        const companyData: any = {
            name: data.name,
            phone: data.phone || null,
            website: data.website || null,
            industry: data.industry || null,
            type: data.type || null,
            source: data.source || null,
            outsourcing: data.outsourcing || null,
            technologies: data.technologies || null,

            numberOfEmployees: data.numberOfEmployees ? parseInt(data.numberOfEmployees) : undefined,
            annualRevenue: data.annualRevenue ? parseFloat(data.annualRevenue) : undefined,
            nextFu: data.nextFu ? new Date(data.nextFu) : undefined,
            lastModifiedBy: (session?.user as any)?.name || "System",

            description: data.description || null,
            companyDetails: data.companyDetails || null,

            // Billing Address
            billingStreet: data.billingStreet || null,
            billingCity: data.billingCity || null,
            billingState: data.billingState || null,
            billingPostalCode: data.billingPostalCode || null,
            billingCountry: data.billingCountry || null,
            // Main address field can be a concatenation or kept separate. 
            // For now, let's auto-fill address from billing if provided for backward compatibility
            address: [data.billingStreet, data.billingCity, data.billingCountry].filter(Boolean).join(', ') || data.address,

            parentAccount: data.parentAccountId ? { connect: { id: parseInt(data.parentAccountId) } } : undefined,
            owner: data.ownerId ? { connect: { id: data.ownerId } } : (userId ? { connect: { id: userId } } : undefined)
        };

        const company = await (prisma as any).company.create({
            data: companyData
        })

        // Create Initial Note if present
        if (data.initialNote) {
            await (prisma as any).note.create({
                data: {
                    content: data.initialNote,
                    account: { connect: { id: company.id } }, // Connect to account
                    author: userId ? { connect: { id: userId } } : undefined
                }
            });
        }

        // Notification: Account Created → visible in HR module
        try {
            const { createNotification } = await import("@/app/actions/notifications");
            await createNotification({
                type: "ACCOUNT_CREATED",
                message: `New Account created: "${company.name}"${company.accountType ? ` (${company.accountType})` : ''}`,
                link: `/commercial/accounts/${company.id}`,
                icon: "🏢",
                sourceModule: "commercial",
                sourceId: company.id,
            });
        } catch (e) {
            console.error("Failed to create ACCOUNT_CREATED notification:", e);
        }

        // SystemLog: Account created
        try {
            const userName = (session?.user as any)?.name || "System";
            await addSystemLog({
                entityType: 'account',
                entityId: company.id,
                action: 'created',
                description: `Account created${data.type ? ` as ${data.type}` : ''}`,
                newValue: data.type || null,
                changedBy: userName,
            });
        } catch (e) {
            console.error('SystemLog: Account created failed:', e);
        }

        revalidatePath('/commercial/accounts')
        return { success: true, data: company }
    } catch (error) {
        console.error("Error creating account:", error)
        return { success: false, error: "Failed to create account" }
    }
}

export async function updateAccount(id: number, data: any) {
    try {
        const session = await getServerSession(authOptions)
        const userName = (session?.user as any)?.name || "System"

        // Fetch current account for change detection
        const currentAccount = await (prisma as any).company.findUnique({ where: { id } });
        if (currentAccount) {
            const { hasChanges } = await import("@/app/lib/changeDetection");
            if (!hasChanges(currentAccount, data)) {
                // Nothing changed — skip update
                revalidatePath('/commercial/accounts')
                return { success: true, data: currentAccount }
            }
        }

        // Sanitize relation fields: empty strings → null to avoid FK violations
        const sanitized = { ...data };
        delete sanitized.dueDateTimezone;
        if (sanitized.ownerId === '' || sanitized.ownerId === undefined) sanitized.ownerId = null;
        if (sanitized.parentAccountId === '' || sanitized.parentAccountId === undefined || sanitized.parentAccountId === null) {
            sanitized.parentAccountId = null;
        } else if (typeof sanitized.parentAccountId === 'string') {
            sanitized.parentAccountId = parseInt(sanitized.parentAccountId) || null;
        }
        // Convert numeric string fields
        if (typeof sanitized.numberOfEmployees === 'string') {
            sanitized.numberOfEmployees = sanitized.numberOfEmployees ? parseInt(sanitized.numberOfEmployees) : null;
        }
        if (typeof sanitized.annualRevenue === 'string') {
            sanitized.annualRevenue = sanitized.annualRevenue ? parseFloat(sanitized.annualRevenue) : null;
        }
        // Convert empty strings to null for optional text fields
        const textFields = ['phone', 'website', 'industry', 'type', 'source', 'outsourcing',
            'technologies', 'description', 'companyDetails', 'billingStreet', 'billingCity', 'billingState',
            'billingPostalCode', 'billingCountry', 'ndaUrl', 'msaUrl', 'otherUrl'];
        for (const field of textFields) {
            if (sanitized[field] === '') sanitized[field] = null;
        }
        // Handle date fields
        if (sanitized.nextFu === '' || sanitized.nextFu === null) {
            sanitized.nextFu = null;
        } else if (typeof sanitized.nextFu === 'string') {
            sanitized.nextFu = new Date(sanitized.nextFu);
            sanitized.nextFuCompleted = false;
        } else if (sanitized.nextFu instanceof Date) {
            sanitized.nextFuCompleted = false;
        }

        for (const dateField of ['ndaDate', 'msaDate', 'otherDate']) {
            if (sanitized[dateField] === '' || sanitized[dateField] === null || sanitized[dateField] === undefined) {
                sanitized[dateField] = null;
            } else if (typeof sanitized[dateField] === 'string' || sanitized[dateField] instanceof Date) {
                sanitized[dateField] = new Date(sanitized[dateField]);
            }
        }

        const company = await (prisma as any).company.update({
            where: { id },
            data: {
                ...sanitized,
                lastModifiedBy: userName
            }
        })

        // A3: Record manual type changes (e.g. user edits Account type from PROSPECT → CUSTOMER)
        if (data.type !== undefined && currentAccount && currentAccount.type !== data.type) {
            try {
                const { recordCompanyTypeChange } = await import("@/app/actions/commercial/history");
                await recordCompanyTypeChange(id, currentAccount.type, data.type, "manual");
            } catch (e) {
                console.error("A3 manual type history failed:", e);
            }
            // SystemLog: type_changed (double-write)
            try {
                await addSystemLog({
                    entityType: 'account',
                    entityId: id,
                    action: 'type_changed',
                    description: `Type changed from ${currentAccount.type || 'none'} to ${data.type}`,
                    oldValue: currentAccount.type || null,
                    newValue: data.type,
                    metadata: { trigger: 'manual' },
                    changedBy: userName,
                });
            } catch (e) {
                console.error('SystemLog: type_changed failed:', e);
            }

            // Cascade: when account becomes Former or Blacklisted, update all linked contacts to FORMER_CLIENT_CONTACT
            const isBecomingFormer = ['Former Customer', 'FORMER_CUSTOMER', 'BLACKLISTED', 'Blacklisted'].includes(data.type);
            const isBecomingActive = data.type === 'Customer';
            if (isBecomingFormer) {
                try {
                    await (prisma as any).contact.updateMany({
                        where: { companyId: id, type: 'CLIENT_CONTACT' },
                        data: { type: 'FORMER_CLIENT_CONTACT' }
                    });
                } catch (e) {
                    console.error('Cascade contacts to FORMER_CLIENT_CONTACT failed:', e);
                }
            } else if (isBecomingActive) {
                try {
                    await (prisma as any).contact.updateMany({
                        where: { companyId: id, type: 'FORMER_CLIENT_CONTACT' },
                        data: { type: 'CLIENT_CONTACT' }
                    });
                } catch (e) {
                    console.error('Cascade contacts to CLIENT_CONTACT failed:', e);
                }
            }
        }

        revalidatePath('/commercial/accounts')
        return { success: true, data: company }
    } catch (error) {
        console.error("Error updating account:", error)
        return { success: false, error: "Failed to update account" }
    }
}

// DELETE Account (legacy — now soft-delete to protect data)
// Hard deletes orphan Opps / Contacts / Assignments. Forward to the cascade soft-delete.
export async function deleteAccount(id: number) {
    const { archiveAccountWithCascade } = await import("@/app/actions/commercial/archive");
    return archiveAccountWithCascade(id, 'Deleted via legacy delete flow');
}

export async function cloneAccounts(ids: number[]) {
    try {
        const session = await getServerSession(authOptions)
        const userName = (session?.user as any)?.name || "System"

        let count = 0;
        for (const id of ids) {
            const account = await (prisma as any).company.findUnique({
                where: { id }
            });
            if (!account) continue;

            const { id: _, createdAt, updatedAt, ...rest } = account;
            const clonedName = `${account.name} (CLONED)`;

            const cloned = await (prisma as any).company.create({
                data: {
                    ...rest,
                    name: clonedName,
                    createdBy: userName,
                    lastModifiedBy: userName
                }
            });

            // Create system log for cloning
            await addSystemLog({
                entityType: 'account',
                entityId: cloned.id,
                action: 'created',
                description: `Account cloned from "${account.name}" (ID: ${account.id})`,
                newValue: clonedName,
                changedBy: userName
            });

            count++;
        }

        revalidatePath('/commercial/accounts');
        return { success: true, count };
    } catch (error: any) {
        console.error("Error cloning accounts:", error);
        return { success: false, error: error.message || "Failed to clone accounts" };
    }
}
