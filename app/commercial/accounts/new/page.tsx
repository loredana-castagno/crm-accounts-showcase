'use client';

import { createAccount, getAccounts } from "@/app/actions/commercial/company";
import { getUsers } from "@/app/actions/users";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Save } from "lucide-react";

export default function NewAccountPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { data: session } = useSession();
    const [parentAccounts, setParentAccounts] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [selectedOwnerId, setSelectedOwnerId] = useState<string>("");
    const [isAddingNote, setIsAddingNote] = useState(false);

    useEffect(() => {
        getAccounts().then(res => {
            if (res.success) setParentAccounts(res.data);
        });
        getUsers().then(res => {
            if (res.success && res.data) {
                setUsers(res.data);
                // Set default owner to current user once users are loaded
                if (session?.user?.email) {
                    const currentUser = res.data.find((u: any) => u.email === session.user?.email);
                    if (currentUser) {
                        setSelectedOwnerId(currentUser.id);
                    }
                }
            }
        });
    }, [session]);

    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsLoading(true);
        setError(null);

        const formData = new FormData(event.currentTarget);
        const data: any = {};
        formData.forEach((value, key) => {
            data[key] = value;
        });

        // Validation
        if (!data.name) {
            setError("Account Name is required");
            setIsLoading(false);
            return;
        }

        const result = await createAccount(data);

        if (result.success) {
            router.push("/commercial/accounts");
            router.refresh();
        } else {
            setError(result.error as string);
            setIsLoading(false);
        }
    }

    return (
        <div className="p-8 max-w-3xl mx-auto space-y-8 min-h-screen bg-gray-50/50">
            <Link
                href="/commercial/accounts"
                className="inline-flex items-center text-xs text-gray-400 hover:text-gray-500 transition-colors"
            >
                ← Accounts
            </Link>

            <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                {/* Header */}
                <div className="p-8 border-b border-gray-50 bg-gray-50/50 flex justify-between items-start">
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 font-montserrat">New Account</h1>
                        <p className="text-gray-500 text-sm font-medium font-lato">Enter details to create a new business account.</p>
                    </div>
                </div>

                <form id="new-account-form" onSubmit={onSubmit} className="p-8 space-y-8">
                    {error && (
                        <div className="p-4 bg-red-50 border-b border-red-100 rounded-lg">
                            <p className="text-sm text-red-600 font-medium">{error}</p>
                        </div>
                    )}

                    {/* Section 1: Account Information */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Account Info</span>
                            <div className="h-px bg-gray-100 flex-1"></div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Account Owner</label>
                                <select
                                    name="ownerId"
                                    value={selectedOwnerId}
                                    onChange={(e) => setSelectedOwnerId(e.target.value)}
                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:border-blue-500 outline-none transition-all font-medium text-sm"
                                >
                                    <option value="">-- Select Owner --</option>
                                    {users.map((user) => (
                                        <option key={user.id} value={user.id}>
                                            {user.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Account Name *</label>
                                <input type="text" name="name" required className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:border-blue-500 outline-none transition-all font-medium text-sm" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Parent Account</label>
                                <select name="parentAccountId" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:border-blue-500 outline-none transition-all font-medium text-sm">
                                    <option value="">Search Accounts...</option>
                                    {parentAccounts.map(a => (
                                        <option key={a.id} value={a.id}>{a.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Phone</label>
                                <input type="tel" name="phone" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:border-blue-500 outline-none transition-all font-medium text-sm" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Outsourcing *</label>
                                <select name="outsourcing" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:border-blue-500 outline-none transition-all font-medium text-sm">
                                    <option value="N/A">N/A</option>
                                    <option value="Yes">Yes</option>
                                    <option value="No">No</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Next FU</label>
                                <input type="date" name="nextFu" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:border-blue-500 outline-none transition-all font-medium text-sm" />
                            </div>
                        </div>
                    </div>

                    {/* Section 2: Additional Information */}
                    <div className="space-y-6 pt-6 border-t border-gray-50">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Additional Info</span>
                            <div className="h-px bg-gray-100 flex-1"></div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Type</label>
                                <select name="type" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:border-blue-500 outline-none transition-all font-medium text-sm">
                                    <option value="">Select</option>
                                    <option value="PROSPECT">Prospect Company</option>
                                    <option value="CUSTOMER">Customer</option>
                                    <option value="FORMER_CUSTOMER">Former Customer</option>
                                    <option value="BLACKLISTED">Blacklisted</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Account Source</label>
                                <select name="source" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:border-blue-500 outline-none transition-all font-medium text-sm">
                                    <option value="">Select</option>
                                    <option value="Sendy DB">Sendy DB</option>
                                    <option value="LeadCandy">LeadCandy</option>
                                    <option value="Scraping (not LI or Snov)">Scraping (not LI or Snov)</option>
                                    <option value="Scraping-LinkedIn">Scraping-LinkedIn</option>
                                    <option value="Client Referral">Client Referral</option>
                                    <option value="Web">Web</option>
                                    <option value="MSP">MSP</option>
                                    <option value="Scraping-Snov">Scraping-Snov</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Industry</label>
                                <select name="industry" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:border-blue-500 outline-none transition-all font-medium text-sm">
                                    <option value="">Select</option>
                                    <option value="Agriculture">Agriculture</option>
                                    <option value="Automotive">Automotive</option>
                                    <option value="Construction">Construction</option>
                                    <option value="Consulting">Consulting</option>
                                    <option value="Education">Education</option>
                                    <option value="Energy & Utilities">Energy & Utilities</option>
                                    <option value="Entertainment">Entertainment</option>
                                    <option value="Finance & Banking">Finance & Banking</option>
                                    <option value="Food & Beverage">Food & Beverage</option>
                                    <option value="Government / Public Sector">Government / Public Sector</option>
                                    <option value="Healthcare">Healthcare</option>
                                    <option value="Manufacturing">Manufacturing</option>
                                    <option value="Marketing & Publicity">Marketing & Publicity</option>
                                    <option value="Real Estate">Real Estate</option>
                                    <option value="Retail">Retail</option>
                                    <option value="Technology / Software">Technology / Software</option>
                                    <option value="Telecommunications">Telecommunications</option>
                                    <option value="Transportation & Logistics">Transportation & Logistics</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">No of Employees</label>
                                <input type="number" name="numberOfEmployees" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:border-blue-500 outline-none transition-all font-medium text-sm" />
                            </div>
                            {/* Annual Revenue removed */}
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Website</label>
                            <input type="url" name="website" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:border-blue-500 outline-none transition-all font-medium text-sm" />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Technologies</label>
                            <input type="text" name="technologies" placeholder="e.g. React, Node.js, AWS" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:border-blue-500 outline-none transition-all font-medium text-sm" />
                        </div>
                    </div>

                    {/* Section 3: Billing Address */}
                    <div className="space-y-6 pt-6 border-t border-gray-50">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Billing Address</span>
                            <div className="h-px bg-gray-100 flex-1"></div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Billing Street</label>
                            <textarea name="billingStreet" rows={2} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:border-blue-500 outline-none transition-all font-medium text-sm resize-none mb-2" />

                            <div className="grid grid-cols-2 gap-2">
                                <input type="text" name="billingCity" placeholder="City" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:border-blue-500 outline-none transition-all font-medium text-sm" />
                                <input type="text" name="billingState" placeholder="State/Province" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:border-blue-500 outline-none transition-all font-medium text-sm" />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <input type="text" name="billingPostalCode" placeholder="Zip/Postal Code" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:border-blue-500 outline-none transition-all font-medium text-sm" />
                                <input type="text" name="billingCountry" placeholder="Country" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:border-blue-500 outline-none transition-all font-medium text-sm" />
                            </div>
                        </div>
                    </div>

                    {/* Section 4: Description */}
                    <div className="space-y-6 pt-6 border-t border-gray-50">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="text-[11px] font-black text-gray-500 uppercase tracking-widest">About this account</span>
                            <div className="h-px bg-gray-100 flex-1"></div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Description</label>
                            <textarea name="description" rows={3} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg focus:border-blue-500 outline-none transition-all font-medium text-sm resize-none" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Company Details</label>
                            <textarea name="companyDetails" rows={3} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg focus:border-blue-500 outline-none transition-all font-medium text-sm resize-none" />
                        </div>
                    </div>

                    {/* History Section */}
                    <div className="pt-6 border-t border-gray-50">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="text-[11px] font-black text-gray-500 uppercase tracking-widest">History</span>
                            <div className="h-px bg-gray-100 flex-1"></div>
                        </div>

                        {!isAddingNote && (
                            <div className="flex justify-end mb-4">
                                <button
                                    type="button"
                                    onClick={() => setIsAddingNote(true)}
                                    className="rounded bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-all rounded-lg"
                                >
                                    + New comment
                                </button>
                            </div>
                        )}

                        {isAddingNote && (
                            <div className="space-y-3 p-5 bg-gray-50 rounded-lg border border-gray-200 border-dashed animate-fadeIn">
                                <textarea
                                    name="initialNote"
                                    rows={3}
                                    placeholder="Add a comment..."
                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:border-blue-500 outline-none transition-all font-medium text-sm"
                                    autoFocus
                                />
                                <div className="flex justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setIsAddingNote(false)}
                                        className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer Actions */}
                    <div className="flex justify-end gap-3 pt-8 border-t border-gray-100">
                        <Link href="/commercial/accounts" className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all" style={{ fontFamily: 'var(--font-lato)' }}>
                            Cancel
                        </Link>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 transition-all disabled:opacity-50"
                            style={{ fontFamily: 'var(--font-lato)' }}
                        >
                            <Save size={16} /> {isLoading ? 'Saving...' : 'Save'}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
}



