import { getAccount } from '@/app/actions/commercial/company';
import AccountDetailClient from './AccountDetailClient';

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const { data: account, error } = await getAccount(parseInt(id));

    if (error || !account) {
        return (
            <div className="p-8">
                <div className="rounded-md bg-red-50 p-4">
                    <div className="text-sm text-red-700">{error || "Account not found"}</div>
                </div>
            </div>
        );
    }

    const serializedAccount = JSON.parse(JSON.stringify(account));
    return <AccountDetailClient account={serializedAccount} />;
}
