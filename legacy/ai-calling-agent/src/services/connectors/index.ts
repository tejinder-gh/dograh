import { BaseToolConnector } from './connector.interface';
import { CalendarConnector } from './calendar-connector';
import { CrmConnector } from './crm-connector';
import { TelephonyConnector } from './telephony-connector';
import { PaymentConnector } from './payment-connector';
import { McpConnector } from './mcp-connector';
import { InternalToolsConnector } from './internal-tools';

export * from './connector.interface';
export * from './calendar-connector';
export * from './crm-connector';
export * from './telephony-connector';
export * from './payment-connector';
export * from './mcp-connector';
export * from './internal-tools';

export class ConnectorRegistry {
  private static connectors: Map<string, BaseToolConnector> = new Map();

  static initialize(): void {
    if (this.connectors.size > 0) return;

    this.register(new CalendarConnector());
    this.register(new CrmConnector());
    this.register(new TelephonyConnector());
    this.register(new PaymentConnector());
    this.register(new McpConnector());
    this.register(new InternalToolsConnector());
  }

  static register(connector: BaseToolConnector): void {
    this.connectors.set(connector.provider, connector);
  }

  static getConnector(provider: string): BaseToolConnector | undefined {
    this.initialize();
    return this.connectors.get(provider);
  }
}
