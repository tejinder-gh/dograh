import { redirect } from "next/navigation";
import { getServerAccessToken, getServerAuthProvider, getServerUser } from "@/lib/auth/server";
import logger from '@/lib/logger';

export const dynamic = 'force-dynamic';

export default async function AfterSignInPage() {
    logger.debug('[AfterSignInPage] Starting after-sign-in page');
    const authProvider = await getServerAuthProvider();

    if (authProvider === 'stack') {
        let user = null;
        try {
            user = await getServerUser();
        } catch (error) {
            logger.error('[AfterSignInPage] Error getting Stack user:', error);
        }
        if (user) {
            redirect('/dashboard');
        }
    }

    let accessToken: string | null = null;
    try {
        accessToken = await getServerAccessToken();
    } catch (error) {
        logger.error('[AfterSignInPage] Error checking access token:', error);
    }

    if (accessToken) {
        redirect('/dashboard');
    }

    // Default fallback if not authenticated
    redirect('/auth/login');
}
