import { ipcMain } from 'electron';

import {
  auditQueryInputSchema,
  auditStateSchema,
  dashboardStateSchema,
  IPC_CHANNELS,
} from '@gtrz/contracts';
import { getAuditState, getDashboardState, type DatabaseContext } from '@gtrz/database';

interface RegisterInsightsIpcOptions {
  readonly getDatabase: () => DatabaseContext;
}

const INSIGHT_CHANNELS = [IPC_CHANNELS.dashboardGetState, IPC_CHANNELS.auditList] as const;

export function registerInsightsIpcHandlers(options: RegisterInsightsIpcOptions): void {
  for (const channel of INSIGHT_CHANNELS) {
    ipcMain.removeHandler(channel);
  }

  ipcMain.handle(IPC_CHANNELS.dashboardGetState, () => {
    return dashboardStateSchema.parse(getDashboardState(options.getDatabase()));
  });

  ipcMain.handle(IPC_CHANNELS.auditList, (_event, payload: unknown) => {
    const input = auditQueryInputSchema.parse(payload ?? {});
    return auditStateSchema.parse(getAuditState(options.getDatabase(), input));
  });
}
