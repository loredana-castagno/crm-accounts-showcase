'use server';

import { db as prisma } from "@/app/lib/db";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

/**
 * Legacy entry — prefer `archiveAccountWithCascade` from `archive.ts`,
 * which validates active assignments and cascades open Opps.
 * Kept for backwards compatibility with any older callsite.
 */
export async function archiveAccount(id: number, reason: string) {
    try {
        const session = await getServerSession(authOptions);
        const userName = (session?.user as any)?.name || 'system';
        await prisma.company.update({
            where: { id },
            data: {
                isArchived: true,
                archiveReason: reason,
                archivedAt: new Date(),
                archivedBy: userName,
                lastModifiedBy: userName,
            },
        });
        revalidatePath('/commercial/accounts');
        revalidatePath(`/commercial/accounts/${id}`);
        return { success: true };
    } catch (error) {
        console.error("Error archiving account:", error);
        return { success: false, error: "Failed to delete account" };
    }
}
