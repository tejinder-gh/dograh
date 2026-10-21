import { BaseToolConnector, ConnectionTestResult, ConnectorExecutionParams } from './connector.interface';
import { safeFetch } from '../../utils/ssrf-guard';

export class TelephonyConnector implements BaseToolConnector {
  readonly provider = 'twilio';

  async testConnection(
    credentials?: Record<string, unknown>,
    _metadata?: Record<string, unknown>
  ): Promise<ConnectionTestResult> {
    const start = Date.now();
    const sid = (credentials?.accountSid || credentials?.apiKey) as string | undefined;
    const token = (credentials?.authToken || credentials?.apiSecret) as string | undefined;

    if (!sid || !token || typeof sid !== 'string' || typeof token !== 'string') {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: 'Missing Twilio Account SID or Auth Token in connection credentials.',
      };
    }

    if (!sid.startsWith('AC') || sid.length !== 34) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: 'Invalid Twilio Account SID format. SID must begin with "AC" and be exactly 34 characters.',
      };
    }

    if (token.length < 16) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: 'Invalid Twilio Auth Token length. Token must be at least 16 characters.',
      };
    }

    try {
      const authHeader = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
      const res = await safeFetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
        headers: { Authorization: authHeader },
      });

      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { message?: string };
        return {
          success: false,
          latencyMs: Date.now() - start,
          message: errBody.message || `Twilio authentication failed with status ${res.status}.`,
        };
      }

      return {
        success: true,
        latencyMs: Date.now() - start,
        message: 'Twilio telephony credentials authenticated. Account is active on Twilio API.',
      };
    } catch (err: unknown) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : 'Failed to reach Twilio API server.',
      };
    }
  }

  async execute(params: ConnectorExecutionParams): Promise<Record<string, unknown>> {
    const { capabilityName, arguments: args, decryptedCredentials } = params;
    const sid = (decryptedCredentials?.accountSid || decryptedCredentials?.apiKey) as string | undefined;
    const token = (decryptedCredentials?.authToken || decryptedCredentials?.apiSecret) as string | undefined;
    const fromPhone = (decryptedCredentials?.fromPhoneNumber || '+15005550006') as string;

    if (!sid || !token) {
      throw new Error(
        '[TWILIO BLOCKED] No verified Twilio credentials configured for this tenant. ' +
        'Telephony and SMS operations are disabled until authorized credentials are connected.'
      );
    }

    switch (capabilityName) {
      case 'send_sms_message': {
        const to = String(args.to || '');
        const message = String(args.message || '');

        if (!to || !message) {
          throw new Error('Both recipient "to" and "message" body are required to send SMS.');
        }

        const bodyParams = new URLSearchParams({
          To: to,
          From: fromPhone,
          Body: message,
        });

        const authHeader = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
        const res = await safeFetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: bodyParams.toString(),
        });

        if (!res.ok) {
          const errData = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(errData.message || `Twilio SMS dispatch failed with status ${res.status}.`);
        }

        const twilioMsg = (await res.json()) as { sid: string; status: string; num_segments?: string };
        return {
          success: true,
          messageSid: twilioMsg.sid,
          recipient: to,
          status: twilioMsg.status,
          segments: Number(twilioMsg.num_segments || 1),
          sentAt: new Date().toISOString(),
        };
      }

      case 'send_otp_verification': {
        const phoneNumber = String(args.phoneNumber || '');
        if (!phoneNumber) {
          throw new Error('phoneNumber is required to dispatch OTP security verification.');
        }

        const authHeader = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
        const verifySid = (decryptedCredentials?.verifyServiceSid as string) || 'VA_DEFAULT';

        const bodyParams = new URLSearchParams({
          To: phoneNumber,
          Channel: 'sms',
        });

        const res = await safeFetch(`https://verify.twilio.com/v2/Services/${verifySid}/Verifications`, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: bodyParams.toString(),
        });

        if (!res.ok) {
          const errData = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(errData.message || `Twilio OTP verification dispatch failed with status ${res.status}.`);
        }

        const verifyRes = (await res.json()) as { sid: string; status: string };
        return {
          success: true,
          verificationSessionId: verifyRes.sid,
          phoneNumber,
          status: verifyRes.status,
          dispatchedAt: new Date().toISOString(),
        };
      }

      default:
        throw new Error(`Unsupported capability "${capabilityName}" on TelephonyConnector.`);
    }
  }
}
