import type { Client } from '@/client/client';
import type { CreateClientConfig } from '@/client/client.gen';

export function getServerBackendUrl() {
    return process.env.BACKEND_URL || 'http://api:8000';
}

/**
 * Resolve the base URL the browser should use to reach the backend API.
 *
 * Precedence:
 *   1. NEXT_PUBLIC_BACKEND_URL — explicit build-time operator config, always wins.
 *   2. backendApiEndpoint — the URL the backend reports it is running on via /health
 *      (surfaced through AppConfigContext). This is the address the browser actually
 *      reaches the backend at; for a backend on a private IP it is that private IP.
 *      Unknown at module init, so createClientConfig seeds without it and
 *      AppConfigProvider upgrades the client once /health resolves.
 *   3. window.location.origin — same-origin public deployment.
 *
 * This is the browser→API order. It is intentionally NOT tunnel-aware: the
 * Cloudflare tunnel URL is only for externally-hosted consumers (telephony
 * webhooks, MCP, external API triggers) that cannot reach a private IP — see
 * resolveWebhookBaseUrl.
 */
export function resolveBrowserBackendUrl(backendApiEndpoint?: string | null): string {
    if (process.env.NEXT_PUBLIC_BACKEND_URL) {
        return process.env.NEXT_PUBLIC_BACKEND_URL;
    }
    // If running in browser on localhost/127.0.0.1, always prefer local backend over external webhook tunnels
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        return 'http://localhost:8000';
    }
    return (
        backendApiEndpoint ||
        (typeof window !== 'undefined' ? window.location.origin : '')
    );
}

export const createClientConfig: CreateClientConfig = (config) => {
    // Use different URLs for server-side vs client-side
    const isServer = typeof window === 'undefined';
    let baseUrl: string;

    if (isServer) {
        baseUrl = getServerBackendUrl();
    } else {
        // The backend-reported endpoint is not known yet at module init;
        // AppConfigProvider upgrades the client base URL once /health reports it
        // (when no explicit NEXT_PUBLIC_BACKEND_URL is configured).
        baseUrl = resolveBrowserBackendUrl();
    }

    return {
        ...config,
        baseUrl,
    };
};

let interceptorRegistered = false;
let responseInterceptorRegistered = false;

/**
 * Register a response interceptor that catches 401 Unauthorized responses
 * on protected API endpoints, clears session cookies, and redirects to login.
 */
export function setupResponseAuthInterceptor(apiClient: Client) {
    if (responseInterceptorRegistered) return;
    responseInterceptorRegistered = true;

    apiClient.interceptors.response.use(async (response, request) => {
        if (response.status === 401 && typeof window !== 'undefined') {
            const url = request?.url || '';
            const isAuthEndpoint =
                url.includes('/api/v1/auth/login') ||
                url.includes('/api/v1/auth/signup') ||
                url.includes('/api/v1/health');
            const isOnAuthPage = window.location.pathname.startsWith('/auth/');

            if (!isAuthEndpoint && !isOnAuthPage) {
                try {
                    await fetch('/api/auth/logout', { method: 'POST' });
                } catch {
                    // Ignore transient network errors during logout
                }
                window.location.href = '/auth/login?session_expired=1';
            }
        }
        return response;
    });
}

/**
 * Register a request interceptor that attaches a fresh access token
 * to every outgoing SDK request. Idempotent — safe for React strict mode.
 */
export function setupAuthInterceptor(apiClient: Client, getAccessToken: () => Promise<string>) {
    setupResponseAuthInterceptor(apiClient);

    if (interceptorRegistered) return;
    interceptorRegistered = true;

    apiClient.interceptors.request.use(async (request) => {
        request.headers.set('ngrok-skip-browser-warning', 'true');
        if (request.headers.get('Authorization')) {
            return request;
        }
        try {
            const token = await getAccessToken();
            request.headers.set('Authorization', `Bearer ${token}`);
        } catch {
            // If token retrieval fails, let the request proceed without auth
        }
        return request;
    });
}
