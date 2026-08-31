"use server";

import { db as prisma } from "@/app/lib/db";
import { revalidatePath } from "next/cache";

export async function createRelationship(data: {
  fromContactId: number;
  toContactId: number;
  type: string;
  label?: string;
  accountId?: number;
}) {
  try {
    if (!data.fromContactId || !data.toContactId) {
      return { success: false, error: "Both source and target contact IDs are required." };
    }
    if (data.fromContactId === data.toContactId) {
      return { success: false, error: "A contact cannot have a relationship with themselves." };
    }

    const relationship = await (prisma as any).contactRelationship.upsert({
      where: {
        fromContactId_toContactId_type: {
          fromContactId: data.fromContactId,
          toContactId: data.toContactId,
          type: data.type,
        },
      },
      update: {
        label: data.label || null,
        accountId: data.accountId || null,
      },
      create: {
        fromContactId: data.fromContactId,
        toContactId: data.toContactId,
        type: data.type,
        label: data.label || null,
        accountId: data.accountId || null,
      },
    });

    if (data.accountId) {
      revalidatePath(`/commercial/accounts/${data.accountId}`);
    }

    return { success: true, data: relationship };
  } catch (error: any) {
    console.error("Error creating contact relationship:", error);
    return { success: false, error: error?.message || "Failed to create relationship." };
  }
}

export async function deleteRelationship(id: number, accountId?: number) {
  try {
    await (prisma as any).contactRelationship.delete({
      where: { id },
    });

    if (accountId) {
      revalidatePath(`/commercial/accounts/${accountId}`);
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error deleting contact relationship:", error);
    return { success: false, error: error?.message || "Failed to delete relationship." };
  }
}

export async function listRelationshipsForAccount(accountId: number) {
  try {
    const relationships = await (prisma as any).contactRelationship.findMany({
      where: {
        OR: [
          { accountId },
          {
            fromContact: { companyId: accountId },
            toContact: { companyId: accountId },
          },
        ],
      },
      include: {
        fromContact: {
          select: { id: true, fullName: true, title: true, buyerRole: true },
        },
        toContact: {
          select: { id: true, fullName: true, title: true, buyerRole: true },
        },
      },
    });

    return { success: true, data: relationships };
  } catch (error: any) {
    console.error("Error listing relationships:", error);
    return { success: false, error: error?.message || "Failed to list relationships.", data: [] };
  }
}
